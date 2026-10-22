<?php

namespace App\Services\Sms;

/**
 * How long an SMS is, as the phone networks count it (HexaTech Loyalty release 4 §5). A text written only in the GSM
 * 7-bit alphabet (GSM 03.38: Latin letters, digits, common signs, a few accented letters and Greek capitals) fits 160
 * characters in one SMS, and 153 in each part of a longer one; the extension characters (`^ { } \ [ ~ ] | €` and form
 * feed) count twice. A single character outside that alphabet (a curly apostrophe, an emoji, Cyrillic) sends the
 * whole text as UCS-2: 70 in one SMS, 67 in each part, a character beyond the Basic Multilingual Plane (most emoji)
 * counting twice. A long text is cut into parts without splitting a doubled character. Twilio and the networks bill
 * every part.
 *
 * The workspace counts the same way (frontend/src/loyalty/sms/smsMath.ts `smsLength`), and the tests hold both to the
 * same examples. Twilio's "smart encoding" (which swaps some Unicode punctuation for GSM look-alikes) is not assumed:
 * the count is never lower than what is billed.
 */
final class SmsText
{
    public const GSM_SINGLE = 160;
    public const GSM_PART = 153;
    public const UCS2_SINGLE = 70;
    public const UCS2_PART = 67;

    /** The GSM 03.38 basic alphabet (the escape character left out: it is never typed). */
    private const BASIC = "@£\$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    /** The extension table: each is sent as an escape and the character, two septets. */
    private const EXTENDED = "\f^{}\\[~]|€";

    /** @var array<string, true>|null */
    private static ?array $basic = null;
    /** @var array<string, true>|null */
    private static ?array $extended = null;

    /**
     * @return array{encoding: 'gsm7'|'ucs2', units: int, segments: int, per_segment: int, unicode: list<string>}
     *   `units` the septets (GSM) or UTF-16 code units (UCS-2) of the text; `per_segment` what one part holds for its
     *   length (160/70 alone, 153/67 in a longer text); `unicode` the first characters (up to ten, each once) that are
     *   not in the GSM alphabet.
     */
    public static function measure(string $text): array
    {
        self::$basic ??= array_fill_keys(mb_str_split(self::BASIC), true);
        self::$extended ??= array_fill_keys(mb_str_split(self::EXTENDED), true);

        $chars = $text === '' ? [] : mb_str_split($text);
        $unicode = [];
        foreach ($chars as $c) {
            if (!isset(self::$basic[$c]) && !isset(self::$extended[$c]) && !in_array($c, $unicode, true)) {
                $unicode[] = $c;
            }
        }
        $gsm = $unicode === [];

        $weights = array_map(fn (string $c) => $gsm
            ? (isset(self::$extended[$c]) ? 2 : 1)
            : (mb_ord($c) > 0xFFFF ? 2 : 1), $chars);
        $units = array_sum($weights);
        $single = $gsm ? self::GSM_SINGLE : self::UCS2_SINGLE;
        $part = $gsm ? self::GSM_PART : self::UCS2_PART;

        if ($units === 0) {
            $segments = 0;
        } elseif ($units <= $single) {
            $segments = 1;
        } else {
            $segments = 1;
            $used = 0;
            foreach ($weights as $w) {
                if ($used + $w > $part) {
                    $segments++;
                    $used = $w;
                } else {
                    $used += $w;
                }
            }
        }

        return [
            'encoding'    => $gsm ? 'gsm7' : 'ucs2',
            'units'       => $units,
            'segments'    => $segments,
            'per_segment' => $segments > 1 ? $part : $single,
            'unicode'     => array_slice($unicode, 0, 10),
        ];
    }

    /** The parts this text is sent as. */
    public static function segments(string $text): int
    {
        return self::measure($text)['segments'];
    }

    /** Line breaks as one `\n` (a browser or a pasted text may send `\r\n`, which would count twice). */
    public static function normalise(string $text): string
    {
        return str_replace(["\r\n", "\r"], "\n", $text);
    }
}
