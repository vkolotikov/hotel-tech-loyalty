<?php

namespace App\Services\Crm;

/** Extract the author's contribution while retaining otherwise missing quoted history separately. */
final class AssistantEmailText
{
    private const QUOTE_HEADER = '/^(?:[-_]{2,} *(?:original message|forwarded message|message d.origine|ursprüngliche nachricht) *[-_]*|begin forwarded message:|(?:On|Am|Le|El) [^\n]{3,300}(?:\n{1,2}[^\n]{1,200})? (?:wrote|schrieb(?: [^:\n]+)?|a écrit|escribió) *:|(?:From|Von|De|От) *:[^\n]*\n+(?:Sent|Date|To|Gesendet|An|Envoyé|À|Para|Enviado|Отправлено|Кому) *:[^\n]*)/imu';

    public static function messages(array $messages): array
    {
        $quoted = [];
        $authored = [];
        foreach ($messages as $index => $message) {
            $body = self::redact($message['body']);
            $body = str_replace(["\r\n", "\r", "\u{00a0}", "\u{202f}"], ["\n", "\n", ' ', ' '], $body);
            $body = preg_replace('/^ +| +$/m', '', $body);
            $body = preg_replace('/\n{3,}/', "\n\n", $body);
            [$new, $old] = array_pad(preg_split(self::QUOTE_HEADER, $body, 2), 2, '');
            // Inline replies after > lines are still the sender's own words.
            preg_match_all('/^>.*$/m', $new, $lines);
            $new = preg_replace('/^>.*(?:\n|$)/m', '', $new);
            $messages[$index]['body'] = self::withoutFooter($new);
            $authored[] = self::fingerprint($messages[$index]['body']);
            // Exclude the remaining Outlook address headers from quoted evidence.
            $old = preg_replace('/^(?:(?:From|Sent|To|Cc|Subject|Date|Von|An|Betreff|De|À|Objet|Asunto|Кому|Тема) *:[^\n]*\n+)*/iu', '', ltrim($old));
            $old = preg_replace('/^[ \t]*(?:>[ \t]*)+/m', '', implode("\n", $lines[0])."\n".$old);
            $quoted[$index] = self::withoutFooter(preg_split(self::QUOTE_HEADER, $old, 2)[0]);
        }


        $unique = [];
        $seenMessages = [];
        $known = array_fill_keys($authored, true);
        foreach ($messages as $index => $message) {
            $key = serialize([$message['sent_at'], $message['direction'], $message['subject'], $message['body'], $quoted[$index]]);
            if ($message['sent_at'] !== null && isset($seenMessages[$key])) {
                continue;
            }
            $seenMessages[$key] = true;
            $fingerprint = self::fingerprint($quoted[$index]);
            if ($fingerprint !== '' && ! isset($known[$fingerprint])) {
                $message['quoted_context'] = mb_substr($quoted[$index], 0, 2200);
                $known[$fingerprint] = true;
            }
            $unique[] = $message;
        }

        return $unique;
    }

    /** Redact explicitly assigned credentials wherever a provider payload includes free text. */
    public static function redact(string $text): string
    {
        $label = '(?:password|passphrase|mot de passe|passwort|contraseña|пароль|api[ _-]?key|access[ _-]?token|client[ _-]?secret|one[- ]time (?:password|passcode))';
        $text = preg_replace('~^\h*'.$label.'\h*\R(?:\h*\R)*\h*[^\r\n]+~imu', '[access detail removed]', $text);
        $text = preg_replace('~\b'.$label.'\h*(?:[:=]|\bis\b|\h[-–]\h)\h*(?:\R\h*)*[^\r\n]+~iu', '[access detail removed]', $text);
        $text = preg_replace('~([?&](?:token|access_token|refresh_token|api_key|signature|x-amz-signature|x-goog-signature)=)[^&#\s]+~iu', '$1[removed]', $text);

        return preg_replace('~\bBearer\h+[A-Za-z0-9._\~+/\-=]{8,}~iu', '[access detail removed]', $text);
    }

    private static function fingerprint(string $body): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $body)));
    }

    private static function withoutFooter(string $body): string
    {
        $body = preg_split('/^(?:(?:All details contained within this e-?mail|This (?:e-?mail|message)(?: and (?:any|its) attachments)?) (?:are|is) confidential\b|Sent from my (?:iPhone|iPad|Android)\b)/imu', $body, 2)[0];
        $closing = '/^(?:(?:best|kind|warm(?:est)?) regards|regards|best wishes|sincerely|cordialement|bien à vous|mit freundlichen grüßen|saludos(?: cordiales)?|thanks(?: again)?|thank you(?: very much)?|merci(?: beaucoup)?)[,.! ]*$/imu';
        if (preg_match($closing, $body, $match, PREG_OFFSET_CAPTURE)) {
            $tail = substr($body, $match[0][1] + strlen($match[0][0]));
            // Keep postscript questions, instructions and specifications below an apparent sign-off.
            if (! preg_match('/[?？]|^(?:P\.?S\.?\b|\d+[.)]\s)|[.!](?:\s|$)|\b(?:please|confirm|attach\w*|quantity|deadline|need|must|should|prefer|size|units?|mm|cm|pcs|pieces|merci de|bitte)\b/imu', $tail)) {
                $before = trim(substr($body, 0, $match[0][1]));
                $body = $before !== '' ? $before : $match[0][0];
            }
        }

        return trim(preg_replace('/\n{3,}/', "\n\n", $body));
    }
}
