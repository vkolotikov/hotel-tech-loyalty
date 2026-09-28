<?php

namespace App\Services\Booking;

/** An extra whose lead time cannot be met by the chosen slot (answers 422). */
class ExtraLeadTimeException extends \RuntimeException
{
}
