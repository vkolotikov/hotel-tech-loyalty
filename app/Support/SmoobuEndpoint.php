<?php

namespace App\Support;

/** Tenant credentials may only be sent to Smoobu, including when old stored URLs are hostile. */
final class SmoobuEndpoint
{
    public const BASE = 'https://login.smoobu.com/api';

    public static function accepts(mixed $url): bool
    {
        return is_string($url) && ($url === '' || rtrim(trim($url), '/') === self::BASE);
    }
}
