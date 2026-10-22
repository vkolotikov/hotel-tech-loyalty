<?php

namespace App\Services\Loyalty\Cards;

/**
 * How a scanned or typed code is read, without the database (HexaTech Loyalty release 5, spec 2026-10-23 §2, §3):
 * the pieces CardLookup looks up in order and NfcCards stores. Pure, so every form is tested by string.
 *
 * - The wallet pass shows the number as `#LS-001001`; a `#` before the code, and the spaces around it, are dropped.
 * - The member app's QR code is JSON: `{"type":"hotel_loyalty","member_number":"…","version":2}`, and before that
 *   `{"type":"hotel_loyalty","token":"…","version":1}`. A USB or Bluetooth QR reader set to a US layout on a computer
 *   with another keyboard layout types it bent: on a German layout the quotes become `Ä`, the colons `Ö`, the braces
 *   `Ü` and `*`, the underscore `?`, the hyphen `ß`, and y and z swap; on a Russian layout the letters come out Cyrillic
 *   (`Э` for a quote, `Ж` for a colon); on a UK layout a quote is `@`. The German and Russian layouts are typed back
 *   key for key; any other bending is read by finding `member…number` and taking the value after it (letters, digits
 *   and hyphens).
 * - A member number compares in upper case with hyphens, spaces, dots, slashes and underscores removed, on both sides.
 * - An NFC card's ID is hex with any separators, or the decimal many keyboard-style readers type (a 4- or 7-byte ID,
 *   in either byte order).
 */
final class CodeReader
{
    /** The characters a member number is compared without (number() here, NUMBER_SQL in SQL). */
    public const NUMBER_SEPARATORS = ['-', ' ', '.', '/', '_'];

    /** The stored member number as number() reads a typed one, in portable SQL (no regex functions). */
    public const NUMBER_SQL = "UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(member_number, '-', ''), ' ', ''), '.', ''), '/', ''), '_', ''))";

    /** A stored card ID as hexUid() reads a scanned one (lower case, without the separators readers put in). */
    public const UID_SQL = "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(uid, ':', ''), '-', ''), ' ', ''), '.', ''), '_', ''))";

    /** The most digits "digits alone" needs (fewer would name too many members to mean one). */
    public const MIN_DIGITS = 4;

    /** The query keys a link may carry a member number or a token under. */
    private const URL_KEYS = ['member_number', 'membernumber', 'member', 'number', 'card', 'code', 'token', 't', 'm', 'id'];

    /** A US-layout key as a German (QWERTZ) layout types it, read back: the typed character => the US one. */
    private const GERMAN = [
        'z' => 'y', 'y' => 'z', 'Z' => 'Y', 'Y' => 'Z',
        'ü' => '[', 'Ü' => '{', '+' => ']', '*' => '}', 'ö' => ';', 'Ö' => ':', 'ä' => "'", 'Ä' => '"', '#' => '\\', "'" => '|',
        'ß' => '-', '?' => '_', ';' => '<', ':' => '>', '-' => '/', '_' => '?',
        '"' => '@', '§' => '#', '&' => '^', '/' => '&', '(' => '*', ')' => '(', '=' => ')', '°' => '~',
    ];

    /** A US-layout key as a Russian (ЙЦУКЕН) layout types it, read back. */
    private const RUSSIAN = [
        'й' => 'q', 'ц' => 'w', 'у' => 'e', 'к' => 'r', 'е' => 't', 'н' => 'y', 'г' => 'u', 'ш' => 'i', 'щ' => 'o', 'з' => 'p', 'х' => '[', 'ъ' => ']',
        'ф' => 'a', 'ы' => 's', 'в' => 'd', 'а' => 'f', 'п' => 'g', 'р' => 'h', 'о' => 'j', 'л' => 'k', 'д' => 'l', 'ж' => ';', 'э' => "'",
        'я' => 'z', 'ч' => 'x', 'с' => 'c', 'м' => 'v', 'и' => 'b', 'т' => 'n', 'ь' => 'm', 'б' => ',', 'ю' => '.', 'ё' => '`',
        'Й' => 'Q', 'Ц' => 'W', 'У' => 'E', 'К' => 'R', 'Е' => 'T', 'Н' => 'Y', 'Г' => 'U', 'Ш' => 'I', 'Щ' => 'O', 'З' => 'P', 'Х' => '{', 'Ъ' => '}',
        'Ф' => 'A', 'Ы' => 'S', 'В' => 'D', 'А' => 'F', 'П' => 'G', 'Р' => 'H', 'О' => 'J', 'Л' => 'K', 'Д' => 'L', 'Ж' => ':', 'Э' => '"',
        'Я' => 'Z', 'Ч' => 'X', 'С' => 'C', 'М' => 'V', 'И' => 'B', 'Т' => 'N', 'Ь' => 'M', 'Б' => '<', 'Ю' => '>', 'Ё' => '~',
        '.' => '/', ',' => '?', '"' => '@', '№' => '#', ';' => '$', ':' => '^', '?' => '&', '/' => '|',
    ];

    /** The code without the spaces around it, invisible marks a reader may add, and the `#` the wallet pass shows. */
    public static function clean(string $code): string
    {
        $code = trim((string) preg_replace('/[\x{FEFF}\x{200B}\x{200C}\x{200D}\x{2060}]/u', '', $code));
        if (str_starts_with($code, '#')) {
            $code = ltrim(substr($code, 1));
        }

        return $code;
    }

    /**
     * The member app's code, read from the JSON as it is, as a German or Russian layout bent it, or by the member
     * number found after `member…number` however the punctuation was bent.
     *
     * @return array{0: 'number'|'token', 1: string}|null
     */
    public static function appCode(string $code): ?array
    {
        $texts = self::layouts($code);
        foreach ($texts as $text) {
            $json = json_decode($text, true);
            if (!is_array($json)) {
                continue;
            }
            $json = array_change_key_case($json, CASE_LOWER);
            foreach (['member_number' => 'number', 'token' => 'token'] as $key => $form) {
                $value = $json[$key] ?? null;
                if (is_string($value) && trim($value) !== '') {
                    return [$form, trim($value)];
                }
            }
        }
        foreach ($texts as $text) {
            if (preg_match('/member[^a-z0-9]{1,3}number[^a-z0-9]{0,8}([a-z0-9]+(?:[-ß\'\x{2010}-\x{2015}][a-z0-9]+)*)/iu', $text, $m)) {
                return ['number', (string) preg_replace('/[ß\'\x{2010}-\x{2015}]/u', '-', $m[1])];
            }
            if (preg_match('/(?<![a-z])token[^a-z0-9]{1,8}([a-z0-9]{16,128})/i', $text, $m)) {
                return ['token', $m[1]];
            }
        }

        return null;
    }

    /** @return list<string> the code, then as a Russian and a German layout would have typed it back to US keys */
    public static function layouts(string $code): array
    {
        $out = [$code];
        if (preg_match('/\p{Cyrillic}/u', $code)) {
            $out[] = strtr($code, self::RUSSIAN);
        }
        if (preg_match('/[äöüÄÖÜß§°]/u', $code)) {
            $out[] = strtr($code, self::GERMAN);
        }

        return array_values(array_unique($out));
    }

    /**
     * What a link may carry a member number or a token in: the values of its query (and fragment) keys first, then
     * the path's segments that hold a digit, the last first. Null when the code is not a link.
     *
     * @return list<string>|null
     */
    public static function urlValues(string $code): ?array
    {
        if (!preg_match('#^(?:[a-z][a-z0-9+.\-]*://|www\.)#i', $code)) {
            return null;
        }
        $parts = parse_url(str_starts_with(strtolower($code), 'www.') ? "https://{$code}" : $code);
        if (!is_array($parts)) {
            return [];
        }

        $values = [];
        foreach ([$parts['query'] ?? '', $parts['fragment'] ?? ''] as $pairs) {
            parse_str((string) $pairs, $query);
            $query = array_change_key_case($query, CASE_LOWER);
            foreach (self::URL_KEYS as $key) {
                if (is_string($query[$key] ?? null) && trim($query[$key]) !== '') {
                    $values[] = trim($query[$key]);
                }
            }
        }
        $segments = array_reverse(array_filter(explode('/', (string) ($parts['path'] ?? '')), fn ($s) => $s !== ''));
        foreach ($segments as $segment) {
            $segment = trim(rawurldecode($segment));
            if (preg_match('/\d/', $segment)) {
                $values[] = $segment;
            }
        }

        return array_values(array_unique($values));
    }

    /** A member number as it is compared: upper case, without the separators (NUMBER_SQL is the stored side). */
    public static function number(string $text): string
    {
        return mb_strtoupper(str_replace(self::NUMBER_SEPARATORS, '', self::clean($text)));
    }

    /** The digits alone, when the code is nothing else (MIN_DIGITS or more), or null. */
    public static function digits(string $code): ?string
    {
        return preg_match('/^\d{' . self::MIN_DIGITS . ',32}$/', $code) ? $code : null;
    }

    /** A card ID in hex however a reader spaced it (`04:A2:B3:C4`, `04-a2-b3-c4`, `04 A2 B3 C4`), lower case, or null. */
    public static function hexUid(string $code): ?string
    {
        $hex = strtolower((string) preg_replace('/[\s:\-._]/', '', $code));

        return $hex !== '' && strlen($hex) <= 50 && ctype_xdigit($hex) ? $hex : null;
    }

    /**
     * The hex a decimal card ID may stand for: a 4-byte ID (up to 4294967295) or a 7-byte one, each in the byte order
     * read and reversed (readers differ). Empty when the digits are no card ID.
     *
     * @return list<string>
     */
    public static function decimalUids(string $code): array
    {
        if (!preg_match('/^\d{5,17}$/', $code)) {
            return [];
        }
        $value = (int) $code;
        $hex = match (true) {
            $value > 0 && $value <= 0xFFFFFFFF          => sprintf('%08x', $value),
            $value > 0xFFFFFFFF && $value <= 0xFFFFFFFFFFFFFF => sprintf('%014x', $value),
            default                                     => null,
        };

        return $hex === null ? [] : array_values(array_unique([$hex, self::reversed($hex)]));
    }

    /** A 4- or 7-byte ID in the other byte order, or null for another length. */
    public static function reversed(string $hex): ?string
    {
        if (!in_array(strlen($hex), [8, 14], true)) {
            return null;
        }

        return implode('', array_reverse(str_split($hex, 2)));
    }

    /**
     * A card ID typed, read by a reader or tapped, as it is stored when a card is linked: lower-case hex without
     * separators. Hex is what has letters a–f or separators, or 8, 14 or 20 digits (a 4-, 7- or 10-byte ID as printed);
     * other digits are the decimal a keyboard-style reader types, converted. `also` are the forms the same card may
     * already be stored under (the other byte order, the other reading of digits), so an existing row is found.
     * Null when the entry is no card ID (4 to 10 bytes).
     *
     * @return array{uid: string, also: list<string>}|null
     */
    public static function cardUid(string $entry): ?array
    {
        $entry = self::clean($entry);
        $hex = self::hexUid($entry);
        if ($hex === null) {
            return null;
        }
        $digitsOnly = (bool) preg_match('/^\d+$/', $entry);
        $asHex = !$digitsOnly || in_array(strlen($entry), [8, 14, 20], true);

        if ($asHex) {
            if (strlen($hex) % 2 !== 0 || strlen($hex) < 8 || strlen($hex) > 20) {
                return null;
            }
            $also = [self::reversed($hex), ...($digitsOnly ? self::decimalUids($entry) : [])];

            return ['uid' => $hex, 'also' => self::others($hex, $also)];
        }

        $decimal = self::decimalUids($entry);
        if ($decimal === []) {
            return null;
        }

        return ['uid' => $decimal[0], 'also' => self::others($decimal[0], array_slice($decimal, 1))];
    }

    /** @param list<?string> $forms @return list<string> */
    private static function others(string $uid, array $forms): array
    {
        return array_values(array_unique(array_filter($forms, fn ($f) => is_string($f) && $f !== $uid)));
    }
}
