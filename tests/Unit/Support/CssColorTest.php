<?php

namespace Tests\Unit\Support;

use App\Support\CssColor;
use PHPUnit\Framework\TestCase;

class CssColorTest extends TestCase
{
    public function test_it_rejects_the_declaration_breakout(): void
    {
        // The payload this class exists for. It needs no HTML-special
        // character, which is why {{ }} never stopped it.
        $this->assertSame(
            CssColor::FALLBACK,
            CssColor::safe('#fff} * {background:url(https://evil.example/x)}'),
        );
    }

    /** @dataProvider hostilePayloads */
    public function test_it_rejects_anything_that_is_not_a_hex_colour(string $payload): void
    {
        $this->assertSame(CssColor::FALLBACK, CssColor::safe($payload));
    }

    public static function hostilePayloads(): array
    {
        return [
            'closing brace'   => ['#fff}'],
            'import'          => ['red;@import url(https://evil.example/x)'],
            'comment escape'  => ['#fff/*'],
            'expression'      => ['expression(alert(1))'],
            'url'             => ['url(https://evil.example/x)'],
            'named colour'    => ['red'],
            'rgb function'    => ['rgb(255,0,0)'],
            'newline'         => ["#fff\n}"],
            'seven digits'    => ['#1234567'],
            'not hex at all'  => ['#gggggg'],
            'leading space'   => [' #fff} *{x:y}'],
        ];
    }

    public function test_it_preserves_a_real_colour(): void
    {
        // The fix must not cost every embedded widget its brand colour.
        $this->assertSame('#c9a84c', CssColor::safe('#c9a84c'));
        $this->assertSame('#c9a84c', CssColor::safe('C9A84C'));
        $this->assertSame('#c9a84c', CssColor::safe('  #C9A84C  '));
    }

    public function test_it_expands_shorthand(): void
    {
        // Callers concatenate alpha onto the result, so a three-digit value has
        // to be widened or "#fff" + "33" would yield the invalid "#fff33".
        $this->assertSame('#ffffff', CssColor::safe('#fff'));
        $this->assertSame('#aabbcc', CssColor::safe('abc'));
    }

    public function test_it_drops_alpha_so_callers_can_append_their_own(): void
    {
        // lead-form.blade.php writes "{{ $color }}33". An eight-digit input
        // would make that ten digits, which the browser discards, silently
        // removing the focus ring.
        $this->assertSame('#c9a84c', CssColor::safe('#c9a84cff'));
        $this->assertSame(6 + 1, strlen(CssColor::safe('#c9a84cff')));
    }

    public function test_empty_and_null_use_the_fallback(): void
    {
        $this->assertSame(CssColor::FALLBACK, CssColor::safe(null));
        $this->assertSame(CssColor::FALLBACK, CssColor::safe(''));
        $this->assertSame(CssColor::FALLBACK, CssColor::safe('   '));
    }

    public function test_the_caller_can_choose_its_own_fallback(): void
    {
        // The widgets do not share one default; lead-form uses #22d3ee.
        $this->assertSame('#22d3ee', CssColor::safe('nonsense', '#22d3ee'));
    }
}
