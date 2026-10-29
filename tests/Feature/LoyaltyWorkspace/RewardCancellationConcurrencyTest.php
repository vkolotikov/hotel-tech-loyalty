<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Http\Controllers\Api\V1\Member\RewardController;
use App\Models\Organization;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\LoyaltyService;
use Database\Factories\LoyaltyMemberFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Committed fixtures let two independent PostgreSQL sessions exercise the real writers and row locks. */
class RewardCancellationConcurrencyTest extends TestCase
{
    public function test_a_pending_cancel_and_fresh_redemption_share_reward_then_member_lock_order(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Requires migrated PostgreSQL and independent processes.');
        }
        $this->assertTrue(app()->environment('testing') && str_ends_with(DB::connection()->getDatabaseName(), '_test'),
            'The concurrency fixture may only commit in an isolated test database.');

        $org = Organization::create(['name' => 'Reward concurrency fixture', 'slug' => 'reward-race-' . bin2hex(random_bytes(8))]);
        app()->instance('current_organization_id', $org->id);
        $marker = tempnam(sys_get_temp_dir(), 'reward-race-');
        $processes = [];
        try {
            $member = LoyaltyMemberFactory::new()->create(['organization_id' => $org->id]);
            $loyalty = app(LoyaltyService::class);
            $loyalty->awardPoints($member, 1000, 'Fixture opening balance');
            $reward = Reward::create(['name' => 'Two available rewards', 'points_cost' => 100, 'stock' => 2, 'is_active' => true]);
            $request = Request::create('/fixture', 'POST');
            $request->setUserResolver(fn () => $member->user);
            $initial = app(RewardController::class)->redeem($request, $reward->id, $loyalty);
            $this->assertSame(201, $initial->getStatusCode());
            $redemptionId = $initial->getData(true)['redemption']['id'];

            $source = <<<'PHP'
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!app()->environment('testing') || !str_ends_with(Illuminate\Support\Facades\DB::connection()->getDatabaseName(), '_test')) throw new RuntimeException('Isolated test database required.');
app()->instance('current_organization_id', (int)$argv[2]);
Illuminate\Support\Facades\DB::select("select set_config('application_name', ?, false)", [$argv[8]]);
Illuminate\Support\Facades\DB::statement("set lock_timeout = '5s'");
$user = App\Models\User::findOrFail((int)$argv[3]);
if ($argv[7] === 'redeem') {
    Illuminate\Support\Facades\DB::listen(function($query) use ($argv) {
        if (str_contains($query->sql, 'from "rewards"') && str_contains($query->sql, 'for update')) {
            file_put_contents($argv[6].'.held', 'held');
            $until = microtime(true) + 10;
            while (!file_exists($argv[6].'.release')) {
                if (microtime(true) > $until) throw new RuntimeException('Parent did not release reward lock.');
                usleep(10000);
            }
        }
    });
    $request = Illuminate\Http\Request::create('/fixture', 'POST');
    $request->setUserResolver(fn () => $user);
    $response = app(App\Http\Controllers\Api\V1\Member\RewardController::class)->redeem($request, (int)$argv[4], app(App\Services\LoyaltyService::class));
    if ($response->getStatusCode() !== 201) throw new RuntimeException($response->getContent());
    echo 'redeemed';
} else {
    app(App\Services\Loyalty\RedemptionActions::class)->cancel((int)$argv[5], $user);
    echo 'cancelled';
}
PHP;
            $db = config('database.connections.' . config('database.default'));
            $env = ['APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql', 'DB_DATABASE' => $db['database'],
                'DB_HOST' => $db['host'], 'DB_PORT' => (string) $db['port'], 'DB_USERNAME' => $db['username'], 'DB_PASSWORD' => $db['password'],
                'CACHE_STORE' => 'array', 'CACHE_SHARED_STORE' => 'array', 'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync'];
            $name = 'reward_cancel_' . bin2hex(random_bytes(5));
            foreach (['redeem', 'cancel'] as $mode) {
                $process = new Process([PHP_BINARY, '-d', 'max_execution_time=0', '-r', $source, base_path(),
                    (string) $org->id, (string) $member->user_id, (string) $reward->id, (string) $redemptionId, $marker, $mode, $name . '_' . $mode], base_path(), $env);
                $process->setTimeout(20);
                $process->start();
                $processes[] = $process;
                if ($mode === 'redeem') {
                    $until = microtime(true) + 10;
                    while (!file_exists($marker . '.held') && $process->isRunning() && microtime(true) < $until) usleep(10000);
                    $this->assertFileExists($marker . '.held', $process->getErrorOutput());
                }
            }

            // Force the cancellation to contend while the fresh redemption owns the reward lock.
            $until = microtime(true) + 10;
            do {
                $waiting = DB::table('pg_stat_activity')->where('application_name', $name . '_cancel')->where('wait_event_type', 'Lock')->exists();
                if (!$waiting) usleep(10000);
            } while (!$waiting && microtime(true) < $until);
            $this->assertTrue($waiting, 'The two workers must actually contend for a lock.');
            file_put_contents($marker . '.release', 'release');
            foreach ($processes as $process) {
                $process->wait();
                $this->assertTrue($process->isSuccessful(), $process->getErrorOutput() . $process->getOutput());
            }

            $this->assertSame(900, $member->fresh()->current_points);
            $this->assertSame(1000, $member->fresh()->lifetime_points);
            $this->assertSame(1000, $member->fresh()->qualifying_points);
            $this->assertSame(1, $reward->fresh()->stock);
            $this->assertSame('cancelled', RewardRedemption::findOrFail($redemptionId)->status);
            $this->assertSame(1, RewardRedemption::where('member_id', $member->id)->where('status', 'pending')->count());
            $this->assertSame(1, PointsTransaction::where('member_id', $member->id)->where('type', 'reverse')->count());
        } finally {
            file_put_contents($marker . '.release', 'release');
            foreach ($processes as $process) if ($process->isRunning()) $process->stop();
            // The organisation's production foreign keys cascade only this test's committed fixtures.
            DB::table('organizations')->where('id', $org->id)->delete();
            app()->forgetInstance('current_organization_id');
            foreach ([$marker, $marker . '.held', $marker . '.release'] as $file) if (is_file($file)) unlink($file);
        }
    }
}
