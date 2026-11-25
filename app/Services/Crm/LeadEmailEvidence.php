<?php

namespace App\Services\Crm;

use App\Models\Brand;
use App\Models\CrmLeadAssistant;
use App\Models\CustomField;
use App\Models\EmailSuppression;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\Task;
use App\Scopes\BrandScope;
use App\Services\Appointments\VenueClock;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;

final class LeadEmailEvidence
{
    public static function policy(Inquiry $lead): array
    {
        $guest = $lead->guest;
        $address = trim((string) $guest?->email);

        return [
            'address_suppressed' => $address !== '' && EmailSuppression::isSuppressed($address, (int) $lead->organization_id),
            'declined' => $lead->pipelineStage?->kind === 'lost' || in_array(strtolower(trim((string) $lead->status)), ['lost', 'declined'], true),
            'sales_email_opt_out' => $guest?->consent_updated_at !== null
                && ($guest->email_consent === false || $guest->marketing_consent === false),
        ];
    }

    public static function stopReason(array $policy, string $mode): ?string
    {
        if ($policy['address_suppressed']) {
            return 'suppressed';
        }
        if ($mode === 'follow_up') {
            if ($policy['sales_email_opt_out']) {
                return 'opted_out';
            }
            if ($policy['declined']) {
                return 'declined';
            }
        }

        return null;
    }

    public static function recheck(array $policy, string $mode, ?array $quote, int $orgId, array $result): ?string
    {
        if ($code = self::stopReason($policy, $mode)) {
            return $code;
        }
        if (($quote || isset($result['quote_stamp'])) && ($result['quote_stamp'] ?? null) !== self::quoteStamp($quote, $orgId)) {
            return 'quote_changed';
        }

        return null;
    }

    public static function hold(string $code, string $language): array
    {
        $reason = trans('crm_email.'.$code, [], $language);

        return ['decision' => in_array($code, ['declined', 'suppressed', 'opted_out'], true) ? 'stop' : 'internal_action',
            'reason_code' => $code, 'reason' => $reason, 'review_notes' => [$reason], 'subject' => '', 'body' => ''];
    }

    public static function currentQuote(?CrmLeadAssistant $state, Inquiry $lead): ?array
    {
        $quote = $state->approved_quote ?? null;

        return $quote && ($quote['contact_id'] ?? null) === $lead->guest_id ? $quote : null;
    }

    public static function quoteStamp(?array $quote, int $orgId): string
    {
        return hash('sha256', serialize(LeadQuote::forDraft($quote, VenueClock::today($orgId))));
    }

    /** @return Builder<Inquiry> */
    public static function projects(Inquiry $lead, Brand $brand): Builder
    {
        return Inquiry::withoutGlobalScope(BrandScope::class)->where('organization_id', $lead->organization_id)
            ->where(fn ($q) => $q->where('brand_id', $brand->id)->when($brand->is_default, fn ($same) => $same->orWhereNull('brand_id')))
            ->where('guest_id', $lead->guest_id);
    }

    public static function collect(Inquiry $lead, Brand $brand, Organization $org): array
    {
        $orgId = (int) $lead->organization_id;
        $today = VenueClock::today($orgId);
        $state = CrmLeadAssistant::query()->whereKey($lead->id)->where('brand_id', $brand->id)->first();
        $files = $lead->attachments()->where('organization_id', $orgId)->limit(20)->get()->map(fn ($file) => [
            'filename' => mb_substr((string) $file->filename, 0, 190), 'type' => $file->mime_type,
            'staff_note' => mb_substr((string) $file->note, 0, 400),
        ])->all();
        $tasks = Task::query()->where('organization_id', $orgId)->where('inquiry_id', $lead->id)
            ->where(fn ($q) => $q->where('brand_id', $brand->id)->orWhereNull('brand_id'))
            ->orderByDesc('id')->limit(24)->get()->map(fn ($task) => [
                'type' => $task->type, 'title' => mb_substr((string) $task->title, 0, 180),
                'due_at' => $task->due_at?->toISOString(), 'completed_at' => $task->completed_at?->toISOString(),
                'outcome' => mb_substr((string) $task->outcome, 0, 350),
            ])->all();
        $other = $lead->guest_id ? self::projects($lead, $brand)->whereKeyNot($lead->id) : null;
        $history = $other ? (clone $other)->whereHas('pipelineStage', fn ($s) => $s->where('kind', 'won'))
            ->latest('id')->limit(5)->get()->map(fn ($row) => $row->only(['external_source', 'event_name', 'inquiry_type', 'fulfillment_stage']))->all() : [];
        $bookings = $lead->guest_id && CrmAccess::seesBookings($org) ? $lead->reservations()->where('organization_id', $orgId)
            ->where('guest_id', $lead->guest_id)->where(fn ($q) => $q->where('brand_id', $brand->id)
                ->when($brand->is_default, fn ($same) => $same->orWhereNull('brand_id')))
            ->latest('id')->limit(8)->get()->map(fn ($row) => $row->only([
                'check_in', 'check_out', 'num_rooms', 'room_type', 'status', 'payment_status',
            ]))->all() : [];
        $custom = $lead->custom_data ?? [];
        $fields = [];
        if ($custom) {
            $definitions = CustomField::query()->where('organization_id', $orgId)->where('entity', 'inquiry')->where('is_active', true)
                ->whereIn('key', array_keys($custom))->whereNotIn('type', ['url', 'email', 'phone'])->orderBy('sort_order')->limit(20)->get();
            foreach ($definitions as $field) {
                $value = $custom[$field->key];
                $parts = is_array($value) ? array_filter($value, 'is_scalar') : [$value];
                if ($parts && is_scalar(reset($parts))) {
                    $fields[] = ['field' => $field->label, 'value' => mb_substr(implode(', ', $parts), 0, 450)];
                }
            }
        }

        return [
            'today' => $today, 'business_timezone' => VenueClock::zone($orgId), 'contact_policy' => self::policy($lead),
            'approved_quote' => LeadQuote::forDraft(self::currentQuote($state, $lead), $today),
            'quote_stamp' => self::quoteStamp(self::currentQuote($state, $lead), $orgId),
            'intake' => $lead->only(['external_source', 'external_id', 'external_submitted_at']),
            'submitted_fields' => $fields, 'linked_reservations' => $bookings,
            'recorded_fulfillment' => $lead->only(['fulfillment_stage', 'payment_status', 'paid_amount', 'currency']),
            'lead_files_metadata_only' => $files, 'attachments_in_outgoing_email' => [],
            'lead_tasks' => $tasks, 'prior_won_projects_background_only' => $history,
            'multiple_projects' => $lead->guest_id && Inquiry::withoutGlobalScope(BrandScope::class)->where('organization_id', $orgId)
                ->where('guest_id', $lead->guest_id)->whereKeyNot($lead->id)->exists(),
            'approved_writing_examples_this_lead' => collect($state->email_reviews ?? [])->whereStrict('contact_id', $lead->guest_id)->map(fn ($review) => [
                ...Arr::only($review, ['approved_at', 'reply_to']), 'original_opening' => mb_substr($review['original']['body'], 0, 600),
                'reviewed_wording' => mb_substr($review['body'], 0, 1100),
            ])->values()->all(),
        ];
    }
}
