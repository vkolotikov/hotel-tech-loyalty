<?php

namespace App\Enums;

/**
 * Canonical enum of the three pipeline-stage kinds the CRM v2 introduced
 * (open/won/lost). `pipeline_stages.kind` is the column.
 *
 * Before this enum, the three values were string literals across 16+
 * backend files — InquiryController stage migration on industry-switch,
 * DealController whereHas, IndustryPresetService preset arrays, CRM AI
 * Toolset, voice toolset, reporting funnels. A typo ('Won', 'lost ',
 * 'opened') silently filtered out rows.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding (pipeline
 * kind literals across 16 files).
 *
 * Sweep policy: new code uses the enum; existing code migrates
 * opportunistically when touched. TS mirror at
 * `frontend/src/lib/pipeline.ts`.
 */
enum PipelineStageKind: string
{
    /** In-progress lead — neither won nor lost. */
    case Open = 'open';

    /** Closed-won — became a customer / booking. */
    case Won = 'won';

    /** Closed-lost — fell out of the pipeline. */
    case Lost = 'lost';

    /** All three values as a string[] — useful for `whereIn(...)`. */
    public static function values(): array
    {
        return [self::Open->value, self::Won->value, self::Lost->value];
    }

    /** True for the open kind only. Helps callers stay readable. */
    public function isOpen(): bool
    {
        return $this === self::Open;
    }

    /** True for either terminal kind. */
    public function isTerminal(): bool
    {
        return $this === self::Won || $this === self::Lost;
    }
}
