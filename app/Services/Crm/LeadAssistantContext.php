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
        $stage = $lead->pipelineStage;
        $customer = $guest ? GuestBusinessProfile::find($guest->id) : null;
        $profile = $this->profiles->data($org, $brand);
        $activities = $this->activities($lead, $brand);
        $chat = $this->chat($lead, $brand);
        $email = ['state' => 'not_connected', 'messages' => [], 'reply_to' => null];
        $whatsapp = ['state' => null, 'messages' => [], 'has_more' => false];
        if ($guest && (int) $lead->brand_id === CrmMail::BRAND && $this->mail->available($user)) {
            $email = $this->mail->assistantHistory($guest);
            $whatsapp = $this->whatsapp->assistantHistory($guest);
        }
        $draft = in_array($mode, ['proposal', 'reply'], true);
        $reviewed = $draft ? $strategies : [];
        $previous = $draft && $guest ? $this->previousEmails($lead, $brand) : [];
        $correspondence = $draft ? CustomerCorrespondence::forDraft($email['messages'], $whatsapp['messages'], $chat, $activities, $previous) : [];
        $target = $correspondence['reply_target'] ?? null;
        $company = Arr::only($customer->fields ?? [], array_keys(BusinessProfile::definitions()));
        $research = $draft ? $this->discovery($customer, $company) : [];
        $enquiry = $lead->only([
            'inquiry_type', 'source', 'status', 'priority', 'num_nights', 'num_rooms', 'num_adults', 'num_children', 'room_type_requested',
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
                    'property' => $this->text($lead->property?->name, 200),
                    'recorded_rate' => $lead->rate_offered,
                    'internal_estimated_deal_value' => $lead->total_value,
                    'currency' => $lead->currency ?: PortalBootstrap::currency($org),
                    'pipeline_stage' => $stage?->only(['name', 'kind', 'default_win_probability']),
                ],
                'contact' => array_map(fn ($value) => $this->text($value, 350), $guest?->only([
                    'full_name', 'first_name', 'salutation', 'company', 'position_title', 'country', 'city', 'preferred_language',
                ]) ?? []) + ['staff_notes' => $this->text($guest?->notes, 2000)],
                'customer_account' => $account?->only(['company_name', 'industry', 'status']) ?? [],
                'reviewed_customer_business' => $company,
                'customer_sources' => collect($customer->sources ?? [])->map(fn ($sources) => array_column($sources, 'url'))->all(),
                'unreviewed_discovery' => $research,
                'conversation' => [
                    'recent_matched_emails' => $email['messages'], 'inbound_email_subject' => $email['reply_to'],
                    'email_capture_state' => $email['state'], 'recent_activities' => $activities,
                    'other_logged_customer_emails' => $previous,
                    'recent_chat_messages' => $chat, 'recent_whatsapp_messages' => $whatsapp['messages'],
                    'whatsapp_capture_state' => $whatsapp['state'],
                    ...$correspondence,
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
                'whatsapp' => count($whatsapp['messages']),
                'whatsapp_state' => $whatsapp['state'],
                'history_limited' => $whatsapp['has_more'] || ($email['total'] ?? 0) > count($email['messages']),
                'other_logged_emails' => count($previous),
                'writing_samples' => count($correspondence['customer_writing_samples'] ?? []),
                'discovery_fields' => count($research),
                'email_state' => $email['state'],
                'strategies' => array_keys($reviewed),
                'reply_to' => $mode === 'reply' && $target ? Arr::only($target, ['channel', 'subject']) : null,
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
                'at' => $row->occurred_at->toISOString(), 'subject' => $this->text($row->subject, 240),
                'body' => $this->text($row->body, 1500),
            ])->all();
    }

    private function previousEmails(Inquiry $lead, Brand $brand): array
    {
        $otherLeads = Inquiry::query()->where('organization_id', $lead->organization_id)->where('brand_id', $brand->id)
            ->where('guest_id', $lead->guest_id)->where('id', '<>', $lead->id)->select('id');

        return Activity::query()->where('organization_id', $lead->organization_id)->where('brand_id', $brand->id)->where('type', 'email')
            ->where(fn ($query) => $query->whereNull('guest_id')->orWhere('guest_id', $lead->guest_id))
            ->where(fn ($query) => $query->whereIn('inquiry_id', $otherLeads)
                ->orWhere(fn ($contact) => $contact->whereNull('inquiry_id')->where('guest_id', $lead->guest_id)))
            ->latest('occurred_at')->latest('id')->limit(16)->get()->reverse()->values()->map(fn ($row) => [
                'scope' => $row->inquiry_id ? 'other_lead' : 'contact', 'kind' => 'email',
                'direction' => $row->direction, 'at' => $row->occurred_at->toISOString(),
                'subject' => $this->text($row->subject, 240), 'body' => $this->text($row->body, 1500),
            ])->all();
    }

    private function discovery(?GuestBusinessProfile $profile, array $reviewed): array
    {
        $run = $profile?->discovery;
        if (($run['status'] ?? null) !== 'ready') {
            return [];
        }
        $findings = [];
        foreach (array_diff_key(BusinessProfile::publicDefinitions(), $reviewed) as $key => $type) {
            $value = BusinessProfile::clean($type, $run['fields'][$key] ?? null);
            $urls = array_filter(array_map(BusinessProfile::publicUrl(...), array_column($run['sources'][$key] ?? [], 'url')));
            if ($value && $urls) {
                $findings[$key] = ['value' => $value, 'sources' => array_slice($urls, 0, 3)];
            }
        }

        return $findings;
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
                'at' => $row->created_at->toISOString(),
                'body' => $this->text($row->content, 1200),
            ])->all();
    }

    private function text(mixed $value, int $length): string
    {
        return is_string($value) ? mb_substr(trim($value), 0, $length) : '';
    }
}
