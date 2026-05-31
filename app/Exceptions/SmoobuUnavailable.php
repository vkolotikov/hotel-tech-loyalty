<?php

namespace App\Exceptions;

/**
 * Marker exception for transient Smoobu PMS failures during the live
 * availability re-check inside BookingEngineService::confirm().
 *
 * Pre-fix behaviour was to log + proceed when the re-check API call
 * threw — but that means a Smoobu outage during confirm() can let us
 * book a room that was sold via an OTA channel seconds earlier. The
 * audit recommended failing closed instead: roll back the transaction,
 * release the advisory lock, and surface a 503 so the guest can retry.
 *
 * Caught by BookingEngineService::confirm()'s outer handler and
 * re-thrown as a Symfony HTTP 503 (HttpExceptionInterface) so the
 * controller returns a clear "pms_unavailable" JSON body. The widget
 * shows a "PMS is temporarily unavailable, please try again in a
 * moment" message instead of a generic error.
 */
class SmoobuUnavailable extends \RuntimeException
{
}
