<?php

use App\Http\Controllers\Api\V1\Admin\PropertyAdminController;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Property;
use App\Services\Content\ContentLocations;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require dirname(__DIR__, 2) . '/vendor/autoload.php';
$app = require dirname(__DIR__, 2) . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (!app()->environment('testing') || config('database.default') !== 'pgsql'
    || !str_ends_with((string) config('database.connections.pgsql.database'), '_test')) {
    throw new RuntimeException('Disposable PostgreSQL test database required.');
}
config(['cache.default' => 'array', 'cache.shared' => 'array', 'mail.default' => 'array', 'filesystems.media_disk' => 'public']);
Http::preventStrayRequests();
$results = [];
$filesystem = app('filesystem');
Property::creating(function ($property) {
    if ($property->name === 'Insert failure') {
        throw new RuntimeException('original_insert_failure');
    }
});
foreach (['success', 'at_cap', 'race', 'insert_failure', 'cleanup_failure'] as $scenario) {
    $org = Organization::create(['name' => 'Property image fixture', 'slug' => 'property-image-' . Str::uuid(),
        'subscription_status' => 'ACTIVE', 'plan_features' => ['max_properties' => '1']]);
    $orgId = (int) $org->id;
    app()->instance('current_organization_id', $orgId);
    $brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $orgId)->value('id');
    app()->instance('current_brand_id', $brandId);
    $uploads = $deletes = $files = [];
    $disk = Mockery::mock();
    $disk->shouldReceive('putFileAs')->andReturnUsing(function ($prefix, $file, $name) use ($scenario, $orgId, $brandId, &$uploads, &$files) {
        $uploads[] = DB::transactionLevel();
        $path = $prefix . '/' . $name;
        $files[$path] = true;
        if ($scenario === 'race') {
            app(ContentLocations::class)->create($orgId, $brandId, ['name' => 'Won the last location']);
        }

        return $path;
    });
    $disk->shouldReceive('delete')->andReturnUsing(function ($path) use ($scenario, &$deletes, &$files) {
        $deletes[] = DB::transactionLevel();
        if (!isset($files[$path])) {
            throw new RuntimeException('tried_to_delete_an_unowned_file');
        }
        if ($scenario === 'cleanup_failure') {
            throw new RuntimeException('fixture_cleanup_failed');
        }
        unset($files[$path]);

        return true;
    });
    Storage::shouldReceive('disk')->with('public')->andReturn($disk);
    try {
        if ($scenario === 'at_cap') {
            app(ContentLocations::class)->create($orgId, $brandId, ['name' => 'Existing location']);
        }
        $request = Request::create('/api/v1/admin/properties', 'POST', [
            'name' => in_array($scenario, ['insert_failure', 'cleanup_failure'], true) ? 'Insert failure' : 'Uploaded place',
            'code' => 'UPLOADTEST',
        ], [], ['image' => UploadedFile::fake()->image('place.png', 10, 10)]);
        try {
            $status = app(PropertyAdminController::class)->store($request)->getStatusCode();
        } catch (RuntimeException $e) {
            $status = $e->getMessage();
        }
        $results[$scenario] = ['status' => $status, 'upload_depths' => $uploads, 'cleanup_depths' => $deletes, 'files' => count($files)];
    } finally {
        Property::withoutGlobalScopes()->where('organization_id', $orgId)->delete();
        Brand::withoutGlobalScopes()->where('organization_id', $orgId)->delete();
        $org->delete();
        Mockery::close();
        Storage::swap($filesystem);
    }
}
echo json_encode($results);
