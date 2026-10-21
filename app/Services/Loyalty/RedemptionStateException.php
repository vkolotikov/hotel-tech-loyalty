<?php

namespace App\Services\Loyalty;

/** A redemption that cannot take this step from where it stands (already fulfilled, already cancelled). */
final class RedemptionStateException extends \DomainException
{
}
