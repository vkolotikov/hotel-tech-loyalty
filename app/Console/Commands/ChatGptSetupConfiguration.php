<?php

namespace App\Console\Commands;

use Illuminate\Http\Request;
use Laravel\Passport\Client;

/** Validation shared by the operator commands; never handles token credentials. */
final class ChatGptSetupConfiguration
{
    public static function origin(mixed $value): ?string
    {
        if (! is_string($value) || ! filter_var($value, FILTER_VALIDATE_URL)) {
            return null;
        }
        $parts = parse_url($value);
        if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])
            || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['query']) || isset($parts['fragment'])
            || ($parts['path'] ?? '') !== '' || Request::create($value)->getSchemeAndHttpHost() !== $value) {
            return null;
        }

        return $value;
    }

    /** @return list<string>|null */
    public static function redirects(mixed $values): ?array
    {
        if (! is_array($values) || $values === []) {
            return null;
        }
        foreach ($values as $value) {
            if (! is_string($value) || ! filter_var($value, FILTER_VALIDATE_URL)
                || preg_match('/[\x00-\x20\x7F*,\\\\]/', rawurldecode($value))) {
                return null;
            }
            $parts = parse_url($value);
            $loopback = in_array($parts['host'] ?? '', ['127.0.0.1', '[::1]', 'localhost'], true);
            if (isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
                || (($parts['scheme'] ?? '') !== 'https'
                    && ! (($parts['scheme'] ?? '') === 'http' && $loopback && ($parts['port'] ?? 0) > 0))) {
                return null;
            }
        }
        $values = array_values(array_unique($values));
        sort($values, SORT_STRING);

        return $values;
    }

    public static function eligibleClient(Client $client): bool
    {
        $grants = $client->grant_types;
        sort($grants, SORT_STRING);

        return ! $client->revoked && ! $client->confidential() && $client->firstParty()
            && $client->provider === null
            && $grants === ['authorization_code', 'refresh_token']
            && $client->hasScope('mcp:use');
    }
}
