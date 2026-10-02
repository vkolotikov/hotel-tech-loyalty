<?php

namespace App\Support\AdminAccess;

/** One staff route's rule in the access map (see AccessMap). */
final class Rule
{
    public function __construct(
        public readonly string $key,
        public readonly string $read,
        public readonly string $change,
        public readonly string $product,
    ) {
    }

    /** GET and HEAD read; every other method changes. */
    public function forMethod(string $method): string
    {
        return in_array(strtoupper($method), ['GET', 'HEAD'], true) ? $this->read : $this->change;
    }
}
