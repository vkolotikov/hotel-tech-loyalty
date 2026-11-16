<?php

use App\Http\Controllers\Api\V1\Admin\PropertyAdminController;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Property;
use App\Services\Content\ContentLocations;
use App\Services\Content\ContentRefused;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

require dirname(__DIR__, 2) . '/vendor/autoload.php';
$app = require dirname(__DIR__, 2) . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (!app()->environment('testing') || config('database.default') !== 'pgsql'
    || !str_ends_with((string) config('database.connections.pgsql.database'), '_test')) {
    throw new RuntimeException('Disposable PostgreSQL test database required.');
}
config(['cache.default' => 'array', 'cache.shared' => 'array', 'mail.default' => 'array']);
Http::preventStrayRequests();
if (($argv[1] ?? '') === 'child') {
    $orgId = (int) $argv[2];
    $brandId = (int) $argv[3];
    app()->instance('current_organization_id', $orgId);
    app()->instance('current_brand_id', $brandId);
    DB::statement("SET lock_timeout = '150ms'");
    try {
        app(ContentLocations::class)->create($orgId, $brandId, ['name' => 'Competing location']);
        echo 'created';
    } catch (ContentRefused $e) {
        echo $e->errorCode;
    } catch (QueryException $e) {
        if ($e->getCode() !== '55P03') {
            throw $e;
        }
        echo 'locked';
    }
    exit;
}

$results = [];
$watch = false;
$child = null;
$during = null;
DB::listen(function ($query) use (&$watch, &$child, &$during) {
    if ($watch && DB::transactionLevel() > 0 && str_contains($query->sql, 'count(*)') && str_contains($query->sql, '"properties"')
        && str_contains($query->sql, '"organization_id"')) {
        $watch = false;
        $during = $child();
    }
});
foreach (['content', 'full_admin'] as $writer) {
    $org = Organization::create(['name' => 'Location lock fixture', 'slug' => 'location-lock-' . Str::uuid(),
        'subscription_status' => 'ACTIVE', 'plan_features' => ['max_properties' => '1']]);
    $orgId = (int) $org->id;
    app()->instance('current_organization_id', $orgId);
    $brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $orgId)->value('id');
    app()->instance('current_brand_id', $brandId);
    $child = function () use ($orgId, $brandId): string {
        $process = new Process([PHP_BINARY, __FILE__, 'child', (string) $orgId, (string) $brandId], base_path(), null, null, 10);
        $process->mustRun();

        return trim($process->getOutput());
    };
    try {
        $during = null;
        $watch = true;
        if ($writer === 'content') {
            app(ContentLocations::class)->create($orgId, $brandId, ['name' => 'Last location']);
        } else {
            $request = Request::create('/api/v1/admin/properties', 'POST', ['name' => 'Last location', 'code' => 'LOCKTEST']);
            app(PropertyAdminController::class)->store($request);
        }
        $watch = false;
        $results[$writer] = ['during' => $during, 'after' => $child(),
            'count' => Property::withoutGlobalScopes()->where('organization_id', $orgId)->count()];
    } finally {
        $watch = false;
        Property::withoutGlobalScopes()->where('organization_id', $orgId)->delete();
        Brand::withoutGlobalScopes()->where('organization_id', $orgId)->delete();
        $org->delete();
    }
}
echo json_encode($results);
