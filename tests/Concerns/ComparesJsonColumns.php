<?php

namespace Tests\Concerns;

/**
 * A JSON column read back compared by meaning, not by key order.
 *
 * PostgreSQL's `jsonb` keeps an object's keys in its own order (shorter keys
 * first), while sqlite's text column hands back the order written, so an
 * assertSame() of a decoded object passes on one engine only. This sorts the
 * keys of every object (a list keeps its order: that is meaning) on both
 * sides and then compares strictly, values and types alike.
 */
trait ComparesJsonColumns
{
    protected function assertSameJson(mixed $expected, mixed $actual, string $message = ''): void
    {
        $this->assertSame(self::keysSorted($expected), self::keysSorted($actual), $message);
    }

    private static function keysSorted(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $value = array_map(self::keysSorted(...), $value);
        if (!array_is_list($value)) {
            ksort($value, SORT_STRING);
        }

        return $value;
    }
}
