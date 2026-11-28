<?php

namespace App\Exceptions;

use RuntimeException;

final class SmoobuAuthenticationFailed extends RuntimeException
{
    public function __construct(string $method, string $path, bool $signed)
    {
        $message = $signed
            ? 'Smoobu rejected the signed request. Check that the API key is active and the signing secret belongs to that key.'
            : 'The Smoobu signing secret is missing. Save a matching API key and signing secret for this Smoobu connection.';

        parent::__construct("Smoobu API error: 401 {$method} {$path} — {$message}", 401);
    }
}
