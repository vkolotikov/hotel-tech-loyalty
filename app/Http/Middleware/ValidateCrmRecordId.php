<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Protect the CRM update controllers' integer arguments before dispatch. */
class ValidateCrmRecordId
{
    public function handle(Request $request, Closure $next, string $parameter): Response
    {
        $value = $request->route($parameter);
        $digits = is_string($value) ? ltrim($value, '0') : '';
        $max = (string) PHP_INT_MAX;

        // Do not cast before checking: oversized decimal strings can overflow
        // PHP's integer argument or PostgreSQL's signed bigint column.
        if (! is_string($value) || ! preg_match('/\A[0-9]+\z/', $value)
            || $digits === '' || strlen($digits) > strlen($max)
            || (strlen($digits) === strlen($max) && strcmp($digits, $max) > 0)) {
            return response()->json(['message' => 'Invalid record ID.'], 404);
        }

        return $next($request);
    }
}
