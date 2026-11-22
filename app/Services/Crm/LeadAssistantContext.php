<?php

namespace App\Services\Crm;

use App\Models\Activity;
use App\Models\Brand;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\GuestBusinessProfile;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\User;
use App\Models\Visitor;
use App\Services\Integrations\CrmMail;
use App\Services\Integrations\CrmWhatsApp;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Support\Arr;

final class LeadAssistantContext
{
    public function __construct(
        private readonly SalesProfile $profiles,
        private readonly CrmMail $mail,
        private readonly CrmWhatsApp $whatsapp,
    ) {}

    public function collect(Inquiry $lead, Brand $brand, Organization $org, User $user, array $strategies, string $mode): array
    {
        $guest = $lead->guest;
        $account = $lead->corporateAccount;
        $customer = $guest ? GuestBusinessProfile::find($guest->id) : null;
        $profile = $this->profiles->data($org, $brand);
        $activities = $this->activities($lead, $brand);
        $chat = $this->chat($lead, $brand);
        $email = ['state' => 'not_connected', 'messages' => [], 'reply_to' => null];
        $whatsapp = [];
        if ($guest && (int) $lead->brand_id === CrmMail::BRAND && $this->mail->available($user)) {
            $email = $this->mail->assistantHistory($guest);
            $bridge = $this->whatsapp->messages($guest, 1);
            $whatsapp = collect($bridge['messages'] ?? [])->take(12)->reverse()->values()->map(fn ($row) => [
                'direction' => $row['direction'] ?? null,
                'sent_at' => $row['sent_at'] ?? null,
                'body' => $this->text($row['body'] ?? null, 900),
            ])->all();
        }
        $reply = $email['reply_to'] !== null ? ['channel' => 'email', 'subject' => $email['reply_to']] : null;
        $reviewed = in_array($mode, ['proposal', 'reply'], true) ? $strategies : [];
        $company = Arr::only($customer?->fields ?? [], array_keys(BusinessProfile::definitions()));
        $enquiry = $lead->only([
            'inquiry_type', 'source', 'status', 'num_rooms', 'num_adults', 'num_children', 'room_type_requested',
            'event_type', 'event_name', 'event_pax', 'function_space', 'catering_required', 'av_required',
        ]);

        return [
            'input' => [
                'lead' => [
                    ...array_map(fn ($value) => is_string($value) ? $this->text($value, 400) : $value, $enquiry),
                    'notes' => $this->text($lead->notes, 6500),
                    'requests' => $this->text($lead->special_requests, 3000),
                    'last_contact_note' => $this->text($lead->last_contact_comment, 1200),
                    'next_task' => $this->text($lead->next_task_notes, 1200),
                    'check_in' => $lead->check_in?->toDateString(),
                    'check_out' => $lead->check_out?->toDateString(),
                    'recorded_rate' => $lead->rate_offered,
                    'internal_estimated_deal_value' => $lead->total_value,
                    'currency' => $lead->currency ?: PortalBootstrap::currency($org),
                ],
                'contact' => array_map(fn ($value) => $this->text($value, 350), $guest?->only([
                    'full_name', 'company', 'position_title', 'country', 'preferred_language',
                ]) ?? []),
                'customer_account' => $account?->only(['company_name', 'industry', 'status']) ?? [],
                'reviewed_customer_business' => $company,
                'customer_sources' => collect($customer?->sources ?? [])->map(fn ($sources) => array_column($sources, 'url'))->all(),
                'conversation' => [
                    'recent_matched_emails' => $email['messages'], 'inbound_email_subject' => $email['reply_to'],
                    'email_capture_state' => $email['state'], 'recent_activities' => $activities,
                    'recent_chat_messages' => $chat, 'recent_whatsapp_messages' => $whatsapp,
                ],
                'our_business' => (array) $profile['fields'],
                'content_planner_fields' => array_values(array_diff(array_keys((array) $profile['inherited']), array_keys((array) $profile['manual']))),
                'reviewed_strategies' => array_map(fn ($strategy) => $strategy['body'], $reviewed),
            ],
            'coverage' => [
                'customer_fields' => count($company),
                'business_fields' => count(array_diff_key((array) $profile['fields'], ['name' => true])),
                'activities' => count($activities),
                'chats' => count($chat),
                'emails' => count($email['messages']),
                'whatsapp' => count($whatsapp),
                'email_state' => $email['state'],
                'strategies' => array_keys($reviewed),
                'reply_to' => $mode === 'reply' ? $reply : null,
            ],
        ];
    }

    private function activities(Inquiry $lead, Brand $brand): array
    {
        return Activity::query()->where('organization_id', $lead->organization_id)->where('inquiry_id', $lead->id)
            ->where(fn ($query) => $query->where('brand_id', $brand->id)->orWhereNull('brand_id'))
            ->whereIn('type', ['note', 'call', 'email', 'meeting', 'chat'])
            ->latest('occurred_at')->latest('id')->limit(16)->get()
            ->reverse()->values()->map(fn ($row) => [
                'kind' => $row->type, 'direction' => $row->direction,
                'at' => $row->occurred_at?->toISOString(), 'subject' => $this->text($row->subject, 240),
                'body' => $this->text($row->body, 1500),
            ])->all();
    }

    private function chat(Inquiry $lead, Brand $brand): array
    {
        $conversations = ChatConversation::query()->where('organization_id', $lead->organization_id)->where('brand_id', $brand->id)
            ->where(function ($query) use ($lead, $brand) {
                $query->where('inquiry_id', $lead->id);
                if ($lead->guest_id) {
                    $visitors = Visitor::query()->where('organization_id', $lead->organization_id)
                        ->where('brand_id', $brand->id)->where('guest_id', $lead->guest_id)->select('id');
                    $query->orWhere(fn ($unassigned) => $unassigned->whereNull('inquiry_id')->whereIn('visitor_id', $visitors));
                }
            });

        return ChatMessage::query()->where('organization_id', $lead->organization_id)
            ->whereIn('conversation_id', $conversations->select('id'))->whereNotNull('content')->where('content', '<>', '')
            ->latest('created_at')->latest('id')->limit(24)->get()->reverse()->values()->map(fn ($row) => [
                'sender' => $row->sender_type,
                'at' => $row->created_at?->toISOString(),
                'body' => $this->text($row->content, 1200),
            ])->all();
    }

    private function text(mixed $value, int $length): string
    {
        return is_string($value) ? mb_substr(trim($value), 0, $length) : '';
    }
}
