<?php

namespace Tests\Unit\Landing;

use App\Landing\Money;
use PHPUnit\Framework\TestCase;

/**
 * The bug this class exists for: a spa's menu printed "145.00 GBP" where its
 * designer had drawn "£145". Every case below is one half of that string.
 */
class MoneyTest extends TestCase
{
    public function test_a_known_currency_prints_its_symbol_not_its_code(): void
    {
        $this->assertSame('£145', Money::format(145, 'GBP'));
        $this->assertSame('€145', Money::format(145, 'EUR'));
        $this->assertSame('$145', Money::format(145, 'USD'));
    }

    public function test_a_whole_amount_drops_its_decimals(): void
    {
        // A price list writes £145. The pennies belong on an invoice.
        $this->assertSame('£145', Money::format(145.00, 'GBP'));
        $this->assertSame('£145.50', Money::format(145.5, 'GBP'));
    }

    public function test_a_float_that_is_almost_whole_still_reads_as_whole(): void
    {
        // Decimal columns come back through PHP floats; 145.000000001 is 145.
        $this->assertSame('£145', Money::format(145.000000001, 'GBP'));
    }

    public function test_currencies_written_after_the_amount_are_written_after_the_amount(): void
    {
        // "zł 145" reads as broken to everyone who uses zlotys.
        $this->assertSame("145\u{00A0}zł", Money::format(145, 'PLN'));
        $this->assertSame("145\u{00A0}Kč", Money::format(145, 'CZK'));
    }

    public function test_the_symbol_and_its_amount_never_break_across_a_line(): void
    {
        $this->assertStringContainsString("\u{00A0}", Money::format(145, 'PLN'));
    }

    public function test_an_unknown_code_keeps_the_honest_fallback(): void
    {
        // Better a code we did not invent a symbol for than a wrong symbol.
        $this->assertSame('145 XYZ', Money::format(145, 'XYZ'));
    }

    public function test_no_currency_prints_the_bare_amount(): void
    {
        $this->assertSame('145', Money::format(145, null));
        $this->assertSame('145', Money::format(145, '   '));
    }

    public function test_a_lowercase_code_is_still_recognised(): void
    {
        $this->assertSame('£145', Money::format(145, 'gbp'));
    }

    public function test_nothing_priced_prints_nothing(): void
    {
        // A row with no price must assert no price -- not "0", not a bare "£".
        $this->assertNull(Money::format(null, 'GBP'));
        $this->assertNull(Money::format('', 'GBP'));
        $this->assertNull(Money::format('not a number', 'GBP'));
    }

    public function test_thousands_are_grouped(): void
    {
        $this->assertSame('£1,450', Money::format(1450, 'GBP'));
    }
}
