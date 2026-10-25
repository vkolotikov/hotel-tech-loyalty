<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\LoyaltyRefused;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Cashback credit's amounts (release 7, spec 2026-10-25 §3), by value: whole cents read exactly from what the
 * decimal(12,2) columns hold, written back as the column's own decimal, and a typed amount refused when it has more
 * decimals than the currency (Stripe's zero-decimal list, through StripeService) or is not a usable amount.
 */
class CreditLedgerAmountsTest extends TestCase
{
    /** @return array<string, array{0: mixed, 1: int}> */
    public static function stored(): array
    {
        return [
            'PostgreSQL text'        => ['12.40', 1240],
            'a negative line'        => ['-0.05', -5],
            'no decimals'            => ['7', 700],
            'one decimal'            => ['7.5', 750],
            'the column\'s ceiling'  => ['9999999999.99', 999999999999],
            'SQLite\'s float'        => [12.4, 1240],
            'a float that is not'    => [0.1 + 0.2, 30],
            'an integer'             => [3, 300],
            'null'                   => [null, 0],
            'empty'                  => ['', 0],
        ];
    }

    #[DataProvider('stored')]
    public function test_a_stored_value_reads_as_exact_cents(mixed $value, int $cents): void
    {
        $this->assertSame($cents, CreditLedger::cents($value));
    }

    public function test_cents_write_back_as_the_columns_decimal_and_answer_as_a_number(): void
    {
        $this->assertSame(['12.40', '-0.05', '0.00', '-12.00', '9999999999.99'], array_map(CreditLedger::decimal(...), [1240, -5, 0, -1200, 999999999999]));
        $this->assertSame([12.4, -0.05, 0.0, 2.25], array_map(CreditLedger::major(...), [1240, -5, 0, 225]));
    }

    public function test_a_zero_decimal_currency_moves_in_whole_units_through_stripes_own_list(): void
    {
        $this->assertSame([1, 1, 100, 100, 100], array_map(CreditLedger::unitCents(...), ['EUR', 'usd', 'JPY', 'krw', 'VND']));
    }

    /** @return array<string, array{0: float, 1: string, 2: bool, 3: ?int}> amount, currency, signed, cents (null: refused) */
    public static function typed(): array
    {
        return [
            'euros and cents'              => [12.4, 'EUR', false, 1240],
            'a float that is two decimals' => [0.1 + 0.2, 'EUR', false, 30],
            'three decimals'               => [1.234, 'EUR', false, null],
            'zero'                         => [0.0, 'EUR', false, null],
            'negative for a spend'         => [-5.0, 'EUR', false, null],
            'negative for a correction'    => [-5.25, 'EUR', true, -525],
            'zero for a correction'        => [0.0, 'EUR', true, null],
            'the largest'                  => [10000000.0, 'EUR', false, 1000000000],
            'above the largest'            => [10000000.01, 'EUR', false, null],
            'whole yen'                    => [1200.0, 'JPY', false, 120000],
            'yen with decimals'            => [1.5, 'JPY', false, null],
            'not a number'                 => [NAN, 'EUR', false, null],
            'infinite'                     => [INF, 'EUR', true, null],
        ];
    }

    #[DataProvider('typed')]
    public function test_a_typed_amount_is_taken_in_cents_or_refused(float $amount, string $currency, bool $signed, ?int $cents): void
    {
        try {
            $this->assertSame($cents, CreditLedger::amountCents($amount, $currency, $signed));
        } catch (LoyaltyRefused $e) {
            $this->assertNull($cents, "refused: {$e->errorCode}");
            $this->assertSame(['bad_amount', 422, strtoupper($currency) === 'JPY' ? 0 : 2], [$e->errorCode, $e->status, $e->extra['decimals']]);
        }
    }

    public function test_the_earn_key_names_the_reference(): void
    {
        $this->assertSame('cashback_service_booking_12', CreditLedger::earnKey('service_booking', 12));
        $this->assertSame('cashback_scan_event_3', CreditLedger::earnKey('scan_event', 3));
    }
}
