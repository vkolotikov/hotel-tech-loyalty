<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use App\Services\Integrations\CrmMail;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** The latest customer or staff message per opportunity and subject, across its verified mailbox and CRM timeline. */
final class TeamEmailThreads
{
    /** @param Collection<int, Inquiry> $leads */
    public function heads(Collection $leads, int $orgId, bool $mailAvailable): array
    {
        $heads = [];
        $byId = $leads->keyBy('id');
        $logs = DB::table('activities')->where('organization_id', $orgId)->whereIntegerInRaw('inquiry_id', $byId->keys()->all())
            ->where('type', 'email')->whereIn('direction', ['inbound', 'outbound'])->whereNotNull('occurred_at')
            ->select(['id', 'brand_id', 'inquiry_id', 'subject', 'direction', 'occurred_at'])->orderBy('id')->cursor();
        foreach ($logs as $log) {
            $lead = $byId->get($log->inquiry_id);
            if ($log->brand_id !== null && (int) $log->brand_id !== (int) $lead->brand_id) {
                continue;
            }
            $subject = CrmMail::threadSubject(['subject' => $log->subject]);
            $this->merge($heads, (int) $lead->id, hash('sha256', $subject), [
                'at' => strtotime($log->occurred_at), 'direction' => $log->direction, 'source' => 'activity',
                'id' => (string) $log->id, 'subject' => mb_substr((string) $log->subject, 0, 180),
            ]);
        }

        $eligible = $leads->filter(fn ($lead) => $mailAvailable && (int) $lead->brand_id === CrmMail::BRAND && $lead->guest !== null);
        if ($eligible->isEmpty() || $orgId !== CrmMail::ORGANIZATION) {
            return $heads;
        }
        $guests = $eligible->pluck('guest_id')->unique()->values()->all();
        $sync = DB::table('crm_correspondence_syncs')->where('organization_id', $orgId)->where('brand_id', CrmMail::BRAND)
            ->whereIntegerInRaw('guest_id', $guests)->pluck('email', 'guest_id');
        $projects = LeadProjectSubjects::forGuests($orgId, $guests);
        foreach ($eligible as $lead) {
            $siblings = $projects[$lead->guest_id] ?? [];
            if (!isset($siblings[$lead->id])) {
                continue;
            }
            foreach (LeadReplyBadges::mailThreads($sync->get($lead->guest_id), $lead->guest, count($siblings) === 1 ? null : $siblings[$lead->id]) as $thread) {
                $key = $thread['subject_key'] ?? '';
                if ($key === '' || empty($thread['message_id']) || !in_array($thread['direction'] ?? null, ['inbound', 'outbound'], true)) {
                    continue;
                }
                $this->merge($heads, (int) $lead->id, $key, [
                    'at' => strtotime($thread['at'] ?? ''), 'direction' => $thread['direction'], 'source' => 'mail',
                    'id' => $thread['message_id'], 'subject' => mb_substr((string) ($thread['subject'] ?? ''), 0, 180),
                ]);
            }
        }

        return $heads;
    }

    private function merge(array &$heads, int $leadId, string $key, array $new): void
    {
        if (!$new['at']) {
            return;
        }
        $previous = $heads[$leadId][$key] ?? null;
        $rank = static fn (array $h) => [$h['at'], (int) ($h['direction'] === 'outbound'), (int) ($h['source'] === 'mail')];
        if (!$previous || $rank($new) >= $rank($previous)) {
            $new['subject'] = $new['subject'] ?: ($previous['subject'] ?? '');
            $heads[$leadId][$key] = $new;
        } elseif (!$previous['subject'] && $new['subject']) {
            $heads[$leadId][$key]['subject'] = $new['subject'];
        }
    }
}
