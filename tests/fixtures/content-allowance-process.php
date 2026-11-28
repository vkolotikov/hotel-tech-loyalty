<?php

use App\Models\AiUsageLog;
use App\Models\Brand;
use App\Models\Organization;
use App\Services\AiUsageService;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

// Separate processes prove the database cache coordinates workers with independent local caches.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! app()->environment('testing') || config('database.default') !== 'pgsql'
    || ! str_ends_with((string) config('database.connections.pgsql.database'), '_test')) {
    throw new RuntimeException('Disposable PostgreSQL test database required.');
}
config(['cache.default' => 'array', 'cache.shared' => 'database', 'mail.default' => 'array']);
Http::preventStrayRequests();
$gate = app(ContentAiGate::class);
if (($argv[1] ?? '') === 'child') {
    $id = (int) $argv[2];
    app()->instance('current_organization_id', $id);
    Cache::put('ai_usage:month:'.$id.':'.now()->format('Y-m'), 0, 60);
    try {
        $gate->attempt($id, fn () => print ('provider_called'));
    } catch (ContentRefused $e) {
        echo $e->errorCode;
    }
    exit;
}
$org = Organization::create(['name' => 'Allowance process fixture', 'slug' => 'allowance-'.Str::uuid(),
    'subscription_status' => 'ACTIVE', 'plan_features' => ['ai_monthly_cost_cents' => 1]]);
$id = (int) $org->id;
app()->instance('current_organization_id', $id);
$child = function () use ($id): string {
    $process = new Process([PHP_BINARY, __FILE__, 'child', (string) $id], base_path(), null, null, 15);
    $process->mustRun();

    return trim($process->getOutput());
};
try {
    $first = $gate->attempt($id, function () use ($id, $child) {
        if (DB::transactionLevel() !== 0) {
            throw new RuntimeException('Provider holds database transaction');
        }
        $result = $child();
        app(AiUsageService::class)->recordUsage($id, 'claude-sonnet-5', 20, 30, 'content');

        return $result;
    });
    $second = $child();
    if ($first !== 'ai_busy' || $second !== 'ai_budget_used_up') {
        throw new RuntimeException('Cross-process allowance invariant failed');
    }
    echo json_encode(['during' => $first, 'after' => $second, 'provider_transactions' => 0]);
} finally {
    AiUsageLog::withoutGlobalScopes()->where('organization_id', $id)->delete();
    Brand::withoutGlobalScopes()->where('organization_id', $id)->delete();
    $org->delete();
}
