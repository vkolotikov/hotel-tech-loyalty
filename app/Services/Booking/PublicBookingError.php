<?php

namespace App\Services\Booking;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class PublicBookingError
{
    public static function response(\Throwable $error, string $message, string $code, int $status): JsonResponse
    {
        $reference = (string) Str::uuid();
        Log::error('public_booking.failure', ['reference' => $reference, 'code' => $code, 'exception' => $error]);
        return response()->json(['error' => $message, 'code' => $code, 'reference' => $reference], $status);
    }
}
