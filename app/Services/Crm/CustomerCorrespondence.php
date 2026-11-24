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
                $body = $channel === 'email' ? self::ownWords($row['body']) : trim($row['body']);
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

        if ($latest = $incoming->first()) {
            $target = ['channel' => 'email', 'at' => $latest['sent_at'], 'subject' => $latest['subject'],
                'body' => self::ownWords($latest['body'])];
        } else {
            // A CRM activity may be a staff paraphrase. It can identify the request, never the customer's voice.
            $logged = collect($activities)->concat(collect($previous)->where('scope', 'contact'))
                ->filter(fn ($row) => $row['direction'] === 'inbound' && in_array($row['kind'], ['email', 'chat', 'call', 'meeting'], true)
                    && ($row['body'] !== '' || $row['subject'] !== ''))
                ->reverse()->sortByDesc(fn ($row) => strtotime((string) $row['at']) ?: 0)->first();
            if ($logged) {
                $candidates['activity'] = ['channel' => 'activity', 'at' => $logged['at'], 'subject' => $logged['subject'], 'body' => $logged['body']];
            }
            $target = collect($candidates)->sortByDesc(fn ($row) => strtotime((string) $row['at']) ?: 0)->first();
        }

        return ['reply_target' => $target, 'customer_writing_samples' => $samples];
    }

    private static function ownWords(string $body): string
    {
        // Leave the captured body available as history. Only the author's new lines are evidence of their style.
        $body = str_replace(["\r\n", "\r"], "\n", $body);
        $parts = preg_split('/^(?:[ \t]*[-_]{2,}[ \t]*(?:(?:original message|forwarded message|message d.origine|ursprüngliche nachricht)[ \t]*[-_]+)?[ \t]*$|[ \t]*(?:On .+ wrote|Am .+ schrieb .+|Le .+ a écrit|El .+ escribió)\s*:|[ \t]*(?:From|Von|De|От):[^\n]*\n[ \t]*(?:Sent|Date|Gesendet|Envoyé|Enviado|Отправлено):)/imu', $body, 2);

        return trim(preg_replace('/^[ \t]*>[^\n]*(?:\n|$)/m', '', $parts[0] ?? ''));
    }
}
