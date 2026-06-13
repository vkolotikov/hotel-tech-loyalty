<?php

namespace Tests\Unit\Enums;

use App\Enums\PipelineStageKind;
use PHPUnit\Framework\TestCase;

/**
 * Locks in the three-value pipeline-stage kind taxonomy. Before this
 * enum, 16+ backend files compared the values as bare string literals,
 * with no central guard against typos. See AUDIT-2026-06-13-ADDENDUM.md
 * maintainability finding.
 */
class PipelineStageKindTest extends TestCase
{
    public function test_values_returns_exactly_three_known_kinds(): void
    {
        $values = PipelineStageKind::values();
        $this->assertCount(3, $values);
        $this->assertContains('open', $values);
        $this->assertContains('won', $values);
        $this->assertContains('lost', $values);
    }

    public function test_is_open_is_only_true_for_open(): void
    {
        $this->assertTrue(PipelineStageKind::Open->isOpen());
        $this->assertFalse(PipelineStageKind::Won->isOpen());
        $this->assertFalse(PipelineStageKind::Lost->isOpen());
    }

    public function test_is_terminal_covers_won_and_lost(): void
    {
        $this->assertFalse(PipelineStageKind::Open->isTerminal());
        $this->assertTrue(PipelineStageKind::Won->isTerminal());
        $this->assertTrue(PipelineStageKind::Lost->isTerminal());
    }

    public function test_try_from_canonical_strings(): void
    {
        $this->assertSame(PipelineStageKind::Open, PipelineStageKind::tryFrom('open'));
        $this->assertSame(PipelineStageKind::Won,  PipelineStageKind::tryFrom('won'));
        $this->assertSame(PipelineStageKind::Lost, PipelineStageKind::tryFrom('lost'));
    }

    public function test_try_from_unknowns_returns_null(): void
    {
        $this->assertNull(PipelineStageKind::tryFrom('Won'));   // case-sensitive
        $this->assertNull(PipelineStageKind::tryFrom('opened'));
        $this->assertNull(PipelineStageKind::tryFrom('lost '));
    }
}
