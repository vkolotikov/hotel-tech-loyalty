<?php

namespace App\Services\Crm;

/** Keep the request being answered distinct from examples of the customer's own words. */
final class CustomerCorrespondence
{
    public static function forDraft(array $emails, array $whatsapp, array $chat, array $activities, array $previous = []): array
    {
        $incoming = collect($emails)->where('direction', 'from_customer')->values();
        $samples = [];
        $seen = [];
        $candidates = [];
        foreach ([
            'email' => $incoming,
            'whatsapp' => collect($whatsapp)->reverse()->where('direction', 'inbound'),
            'chat' => collect($chat)->reverse()->where('sender', 'visitor'),
        ] as $channel => $rows) {
            $count = 0;
            foreach ($rows as $row) {
                $body = trim($row['body']);
                if ($body === '') {
                    continue;
                }
                $message = ['channel' => $channel, 'at' => $row['sent_at'] ?? $row['at'] ?? null, 'body' => $body];
                $candidates[$channel] ??= $message;
                $excerpt = mb_substr($body, 0, 650);
                if (! isset($seen[$excerpt])) {
                    $samples[] = ['channel' => $channel, 'words' => $excerpt];
                    $seen[$excerpt] = true;
                    if (++$count === 3) {
                        break;
                    }
                }
            }
        }

        // An explicitly logged inbound message can update a captured email on this opportunity.
        $logged = collect($activities)->concat(collect($previous)->where('scope', 'contact'))
            ->filter(fn ($row) => $row['direction'] === 'inbound' && in_array($row['kind'], ['email', 'chat', 'call', 'meeting'], true)
                && ($row['body'] !== '' || $row['subject'] !== ''))
            ->reverse()->sortByDesc(fn ($row) => strtotime((string) $row['at']) ?: 0)->first();
        if ($logged) {
            $candidates['activity'] = ['channel' => 'activity', 'at' => $logged['at'], 'subject' => $logged['subject'], 'body' => $logged['body']];
        }
        $newest = collect($candidates)->sortByDesc(fn ($row) => strtotime((string) $row['at']) ?: 0)->first();
        if ($latest = $incoming->firstWhere('reply_status', 'needs_reply') ?? $incoming->first()) {
            $target = ['channel' => 'email', 'at' => $latest['sent_at'], 'subject' => $latest['subject'],
                'body' => $latest['body']];
        } else {
            $target = $newest;
        }

        $update = $newest && $target && $newest['channel'] !== $target['channel']
            && strtotime((string) $newest['at']) > strtotime((string) $target['at']) ? $newest : null;

        return ['reply_target' => $target, 'latest_customer_update' => $update, 'customer_writing_samples' => $samples];
    }

    /** Dates actually supplied to this draft, by channel. Separate clocks keep a later email from hiding a new chat. */
    public static function times(array $emails, array $whatsapp, array $chat, array $activities, array $previous = []): array
    {
        $logged = collect($activities)->concat(collect($previous)->where('scope', 'contact'))
            ->whereIn('direction', ['inbound', 'outbound'])->whereIn('kind', ['email', 'chat', 'call', 'meeting']);
        return array_filter([
            'email' => self::latestTime(array_column($emails, 'sent_at')),
            'whatsapp' => self::latestTime(array_column($whatsapp, 'sent_at')),
            'chat' => self::latestTime(array_column($chat, 'at')),
            'activity' => self::latestTime($logged->pluck('at')->all()),
        ]);
    }

    private static function latestTime(array $dates): int
    {
        return max([0, ...array_map(fn ($date) => strtotime((string) $date) ?: 0, $dates)]);
    }
}
