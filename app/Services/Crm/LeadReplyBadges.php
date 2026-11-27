<?php

namespace App\Services\Crm;

use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\User;
use App\Services\Integrations\CrmMail;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class LeadReplyBadges
{
    /** @param Collection<int, Inquiry> $leads */
    public static function attach(Collection $leads, User $user): void
    {
        $eligible = $leads->filter(fn (Inquiry $lead): bool => (int) $lead->brand_id === CrmMail::BRAND
            && (int) $lead->organization_id === CrmMail::ORGANIZATION && $lead->guest !== null);
        if ($eligible->isEmpty() || ! app(CrmMail::class)->available($user)) {
            return;
        }

        $states = DB::table('crm_correspondence_syncs')->where('organization_id', CrmMail::ORGANIZATION)->where('brand_id', CrmMail::BRAND)
            ->whereIn('guest_id', $eligible->pluck('guest_id'))->get(['guest_id', 'email', 'whatsapp'])->keyBy('guest_id');
        if ($states->isEmpty()) {
            return;
        }
        $projects = LeadProjectSubjects::forGuests(CrmMail::ORGANIZATION, $states->keys()->all());
        foreach ($eligible as $lead) {
            $row = $states->get($lead->guest_id);
            $siblings = $projects[$lead->guest_id] ?? [];
            if (! $row || ! isset($siblings[$lead->id])) {
                continue;
            }
            $shared = count($siblings) > 1;
            $mailThreads = self::mailThreads($row->email, $lead->guest, $shared ? $siblings[$lead->id] : null);
            $wa = json_decode($row->whatsapp ?? '[]', true);
            $waThreads = ! $shared && ($wa['identity'] ?? null) === LeadCorrespondenceSync::phoneIdentity($lead->guest) ? $wa['threads'] : [];
            $lead->setAttribute('reply_status', array_filter([
                'email' => self::channel($mailThreads), 'whatsapp' => self::channel($waThreads),
            ]) ?: null);
            $latest = [];
            foreach (['email' => $mailThreads, 'whatsapp' => $waThreads] as $channel => $threads) {
                $last = collect($threads)->whereIn('direction', ['inbound', 'outbound'])
                    ->sortByDesc(fn ($row) => strtotime($row['at'] ?? '') ?: 0)->first();
                if (! empty($last['at'])) {
                    $latest[$channel] = ['at' => $last['at'], 'direction' => $last['direction']];
                }
            }
            $lead->setAttribute('latest_correspondence', $latest ?: null);
        }
    }

    /** Annotate only the verified last message of each thread on the currently authorised history page. */
    public static function emailPage(Guest $guest, ?Inquiry $lead, array $page): array
    {
        if ((int) $guest->organization_id !== CrmMail::ORGANIZATION || empty($page['connected']) || empty($page['messages'])) {
            return $page;
        }
        $email = DB::table('crm_correspondence_syncs')->where('organization_id', CrmMail::ORGANIZATION)->where('brand_id', CrmMail::BRAND)
            ->where('guest_id', $guest->id)->value('email');
        if (! $email) {
            return $page;
        }
        $subjects = null;
        if ($lead) {
            $projects = LeadProjectSubjects::forGuests(CrmMail::ORGANIZATION, [$guest->id])[$guest->id] ?? [];
            $subjects = count($projects) === 1 && isset($projects[$lead->id]) ? null : ($projects[$lead->id] ?? []);
        }
        $directions = array_column(self::mailThreads($email, $guest, $subjects), 'direction', 'message_id');
        foreach ($page['messages'] as $i => $message) {
            if (isset($directions[$message['id']])) {
                $page['messages'][$i]['reply_status'] = $directions[$message['id']] === 'inbound' ? 'needs_reply' : 'awaiting_customer';
            }
        }

        return $page;
    }

    public static function mailThreads(?string $encoded, Guest $guest, ?array $subjects): array
    {
        $email = json_decode($encoded ?? '[]', true);
        if (($email['identity'] ?? null) !== LeadCorrespondenceSync::emailIdentity($guest)) {
            return [];
        }
        if ($subjects === null) {
            return $email['threads'] ?? [];
        }
        $allowed = array_map(fn ($subject) => hash('sha256', (string) $subject), array_keys($subjects));

        return array_filter($email['threads'] ?? [], fn ($thread) => in_array($thread['subject_key'] ?? null, $allowed, true));
    }

    private static function channel(array $threads): ?string
    {
        if (in_array('inbound', array_column($threads, 'direction'), true)) {
            return 'needs_reply';
        }

        return in_array('outbound', array_column($threads, 'direction'), true) ? 'awaiting_customer' : null;
    }
}
