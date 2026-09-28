<?php

namespace App\Services\Booking;

/**
 * The slot the scheduler was asked to reserve is no longer available — a
 * confirmed booking or an active hold already sits on it. Extends
 * RuntimeException so the public widget's existing `catch (\RuntimeException)`
 * branches keep working unchanged; the portal controller matches this type
 * specifically so an unrelated failure (a database error, say) is never
 * reported as "that time was just taken".
 */
class SlotTakenException extends \RuntimeException
{
}
