<?php

namespace App\Scopes;

use App\Services\IntegrationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Hides synced rows from listings/analytics while their source integration
 * is deactivated. The data stays in the database — only reads are filtered,
 * so re-enabling the integration restores the rows instantly.
 *
 * Sync writes from the integration's own client should already be skipped
 * (the client falls back to mock mode when disabled). If a future caller
 * needs to bypass the filter — e.g. a deliberate cross-integration export
 * — use ->withoutGlobalScope(IntegrationDataScope::class).
 */
class IntegrationDataScope implements Scope
{
    public function __construct(private string $integration) {}

    public function apply(Builder $builder, Model $model): void
    {
        if (!IntegrationStatus::isEnabled($this->integration)) {
            $builder->whereRaw('1 = 0');
        }
    }
}
