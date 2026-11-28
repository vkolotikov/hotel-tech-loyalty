<?php

namespace App\Providers;

use App\Services\Crm\IntakeTokens;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;

/**
 * HexaTech CRM's API tokens send leads in and do nothing else (round 5, 2026-11-12): Sanctum asks this for every
 * personal access token on every request, and a lead-intake token counts as no token anywhere but
 * `POST /v1/integrations/leads` (IntakeTokens::admits). Every other token is judged as before. Registered in
 * bootstrap/providers.php (AppServiceProvider is not loaded by this application).
 */
final class CrmIntakeTokensServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Sanctum::authenticateAccessTokensUsing(
            static fn (mixed $token, bool $isValid): bool => $isValid && IntakeTokens::admits($token),
        );
    }
}
