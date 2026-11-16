<?php

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('testing') || \Illuminate\Support\Facades\DB::getDriverName() !== 'pgsql'
    || !str_contains(\Illuminate\Support\Facades\DB::connection()->getDatabaseName(), 'test')) {
    fwrite(STDERR, 'Isolated PostgreSQL test database required.');
    exit(2);
}
\Illuminate\Support\Facades\Mail::fake();
\Illuminate\Support\Facades\Http::preventStrayRequests();
[$script, $userId, $mode, $argument, $ready] = $argv;
$user = \App\Models\User::findOrFail((int) $userId);
app()->instance('current_organization_id', $user->organization_id);
file_put_contents($ready, (string) \Illuminate\Support\Facades\DB::selectOne('select pg_backend_pid() as pid')->pid);
$request = \Illuminate\Http\Request::create('/team', 'POST', $mode === 'invite'
    ? ['email' => $argument, 'name' => 'New colleague', 'role' => 'staff'] : []);
$request->setUserResolver(fn () => $user);
$controller = app(\App\Http\Controllers\Api\V1\Admin\TeamController::class);
echo ($mode === 'invite' ? $controller->invite($request) : $controller->reactivate($request, (int) $argument))->getStatusCode();
