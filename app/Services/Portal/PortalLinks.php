<?php

namespace App\Services\Portal;

/**
 * Absolute URLs into the member portal.
 *
 * Same fallback rule as Member\ReferralController and
 * AuthController::resolveLoyaltyUrl: an unset app.url in production must
 * not quietly produce a localhost link in something a member forwards, so
 * outside production the request host fills in and in production the
 * caller gets null and hides the link.
 */
final class PortalLinks
{
    /**
     * The pure decision behind {@see base()}, pulled out so the
     * safety-critical rule (never a localhost link in production) can be
     * tested with literal booleans instead of fighting `app()->environment()`
     * and `app()->runningInConsole()` — the latter is always true under
     * PHPUnit, which previously made the production branch unreachable from
     * any test that only swapped the environment.
     */
    public static function resolve(?string $configured, bool $production, bool $console, ?string $requestHost): ?string
    {
        $configured = trim((string) $configured);
        if ($configured !== '') {
            return rtrim($configured, '/');
        }

        if (!$production && !$console && $requestHost !== null && $requestHost !== '') {
            return rtrim(trim($requestHost), '/');
        }

        return null;
    }

    public static function base(): ?string
    {
        return self::resolve(
            config('app.url'),
            app()->environment('production'),
            app()->runningInConsole(),
            app()->runningInConsole() ? null : request()->getSchemeAndHttpHost(),
        );
    }

    public static function join(string $widgetToken, ?string $ref = null): ?string
    {
        $base = self::base();
        if (!$base) {
            return null;
        }
        return $base . '/portal/join?org=' . urlencode($widgetToken)
            . ($ref ? '&ref=' . urlencode($ref) : '');
    }

    public static function claim(): ?string
    {
        $base = self::base();
        return $base ? $base . '/portal/claim' : null;
    }
}
