<?php

namespace App\Landing;

/**
 * A price as a customer should read it.
 *
 * The templates used to print `number_format($price, 2)` followed by the raw
 * ISO code, so a spa's menu read "145.00 GBP" where its designer had drawn
 * "£145". Two separate wrongs in one string: an accounting format where a
 * price list wants a price, and a currency CODE where every real menu shows a
 * symbol. It looked like a database field, which is exactly what it was.
 *
 * Rules, in the order they matter:
 *
 *   1. A known currency prints its symbol, on the side that currency is
 *      actually written on -- "£145" but "145 zł". Getting the side wrong
 *      reads as broken to the people who use that currency every day.
 *   2. A whole amount drops its decimals. Menus write "£145", not "£145.00";
 *      the pennies only appear when there are pennies.
 *   3. An unknown or absent code keeps today's behaviour -- the amount, then
 *      the code if we have one. A tenant billing in a currency this map has
 *      never heard of still gets something honest rather than a guess.
 *
 * Not `NumberFormatter`: ext-intl is not a dependency of this app, and the
 * formatting a landing page needs is a symbol and a decimal rule, not locale
 * negotiation. A twenty-line map that is right beats a dependency that might
 * not be installed on the box.
 */
final class Money
{
    /**
     * Symbol, and whether it leads or trails, per ISO 4217 code.
     *
     * Trailing entries carry a non-breaking space so the amount and its
     * symbol never break across a line -- "145 zł" is one word to a reader.
     *
     * @var array<string, array{0: string, 1: bool}> [symbol, leads]
     */
    private const SYMBOLS = [
        'GBP' => ['£', true],
        'EUR' => ['€', true],
        'USD' => ['$', true],
        'CHF' => ['CHF ', true],
        'UAH' => ['₴', true],
        'TRY' => ['₺', true],
        'PLN' => ['zł', false],
        'CZK' => ['Kč', false],
        'SEK' => ['kr', false],
        'NOK' => ['kr', false],
        'DKK' => ['kr', false],
        'HUF' => ['Ft', false],
        'RON' => ['lei', false],
        'BGN' => ['лв', false],
    ];

    public static function format(float|int|string|null $amount, ?string $currency): ?string
    {
        if ($amount === null || $amount === '' || !is_numeric($amount)) {
            return null;
        }

        $value  = (float) $amount;
        $code   = strtoupper(trim((string) $currency));
        $number = self::number($value);

        if ($code === '' || !isset(self::SYMBOLS[$code])) {
            return $code === '' ? $number : $number . ' ' . $code;
        }

        [$symbol, $leads] = self::SYMBOLS[$code];

        return $leads ? $symbol . $number : $number . "\u{00A0}" . $symbol;
    }

    /**
     * Whole amounts lose their decimals; fractional ones keep exactly two.
     *
     * Compared against an epsilon rather than casting to int, so a price that
     * arrives as 145.000000001 out of a float column still prints as 145.
     */
    private static function number(float $value): string
    {
        $isWhole = abs($value - round($value)) < 0.005;

        return number_format($value, $isWhole ? 0 : 2);
    }
}
