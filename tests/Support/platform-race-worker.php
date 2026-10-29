<?php

// Subprocess for PlatformConcurrencyTest. It never boots against a non-test database.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('testing') || \Illuminate\Support\Facades\DB::getDriverName() !== 'pgsql'
    || !str_contains(\Illuminate\Support\Facades\DB::connection()->getDatabaseName(), 'test')) {
    fwrite(STDERR, 'Isolated PostgreSQL test database required.');
    exit(2);
}
[$script, $mode, $userId, $argument, $ready, $go] = $argv;
$user = \App\Models\User::findOrFail((int) $userId);
app()->instance('current_organization_id', $user->organization_id);
touch($ready);
$deadline = microtime(true) + 20;
while (!file_exists($go)) {
    if (microtime(true) > $deadline) throw new \RuntimeException('Race barrier timed out.');
    usleep(10000);
}
if ($mode === 'recover' || $mode === 'recover_mixed') {
    [$purpose, $code] = $mode === 'recover_mixed' ? explode(':', $argument, 2) : ['reset', $argument];
    try {
        \App\Services\Auth\AccountRecovery::consume($user->email, $code, 'RaceReplacement123!', $purpose, function () {
            usleep(200000);
        });
        echo '200';
    } catch (\Illuminate\Validation\ValidationException) {
        echo '422';
    }
} elseif ($mode === 'demote') {
    $request = \Illuminate\Http\Request::create('/team/'.$argument, 'PUT', ['role' => 'manager']);
    $request->setUserResolver(fn () => $user);
    echo app(\App\Http\Controllers\Api\V1\Admin\TeamController::class)->update($request, (int) $argument)->getStatusCode();
} else {
    throw new \InvalidArgumentException('Unknown race.');
}
