<?php

namespace App\Services\ContentPlanner;

use Closure;

final class CalendarGenerationBudget
{
    public const MAX_SECONDS = 240;

    private Closure $clock;
    private float $deadline;

    public function __construct(?Closure $clock = null)
    {
        $this->clock = $clock ?? static fn (): float => hrtime(true) / 1_000_000_000;
        $this->deadline = ($this->clock)() + self::MAX_SECONDS;
    }

    public function remaining(): float
    {
        return max(0, $this->deadline - ($this->clock)());
    }

    public function requestTimeout(): float
    {
        $remaining = $this->remaining();
        if ($remaining <= 0) {
            throw new CalendarGenerationException('time_budget_exceeded', 'Calendar generation reached its time limit.');
        }

        return min(90, $remaining);
    }
}
