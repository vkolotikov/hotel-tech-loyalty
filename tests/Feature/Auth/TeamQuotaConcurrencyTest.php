<?php

namespace Tests\Feature\Auth;

use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Committed fixtures and independent connections prove the organization lock serializes seat claims. */
class TeamQuotaConcurrencyTest extends TestCase
{
    private ?Organization $org = null;
    private array $files = [];
    private array $processes = [];
    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::getDriverName() !== 'pgsql') $this->markTestSkipped('Requires isolated migrated PostgreSQL test database.');
        $this->assertTrue(app()->environment('testing') && str_contains(DB::connection()->getDatabaseName(), 'test'));
        $this->org = Organization::create(['name' => 'Seat race', 'slug' => 'seat-race-'.bin2hex(random_bytes(6)),
            'plan_features' => ['max_team_members' => '2']]);
        app()->instance('current_organization_id', $this->org->id);
        $this->manager = $this->person(true);
    }

    protected function tearDown(): void
    {
        foreach ($this->processes as $process) if ($process->isRunning()) $process->stop();
        while (DB::transactionLevel() > 0) DB::rollBack();
        foreach ($this->files as $file) if (file_exists($file)) unlink($file);
        if ($this->org !== null) {
            $users = User::where('organization_id', $this->org->id)->pluck('id');
            DB::table('email_verification_codes')->whereIn('user_id', $users)->delete();
            DB::table('audit_logs')->where('organization_id', $this->org->id)->delete();
            Staff::withoutGlobalScopes()->where('organization_id', $this->org->id)->delete();
            User::whereIn('id', $users)->delete();
            $this->org->delete();
        }
        app()->forgetInstance('current_organization_id');
        parent::tearDown();
    }

    private function person(bool $active): User
    {
        $user = User::create(['name' => 'Seat claimant', 'email' => bin2hex(random_bytes(8)).'@example.test',
            'password' => 'TestPassword123!', 'user_type' => 'staff', 'organization_id' => $this->org->id]);
        Staff::create(['user_id' => $user->id, 'role' => 'manager', 'is_active' => $active]);
        return $user;
    }

    private function race(array $claims): void
    {
        // Hold the real lock until BOTH requests are waiting for it. With the old code,
        // invitation prechecks both read one free seat before either can insert.
        DB::beginTransaction();
        Organization::whereKey($this->org->id)->lockForUpdate()->firstOrFail();
        $pids = [];
        foreach ($claims as [$mode, $argument]) {
            $ready = tempnam(sys_get_temp_dir(), 'seat-ready-');
            unlink($ready);
            $this->files[] = $ready;
            $process = new Process([PHP_BINARY, '-d', 'max_execution_time=0', base_path('tests/Support/team-quota-race-worker.php'),
                (string) $this->manager->id, $mode, (string) $argument, $ready], base_path(), null, null, 30);
            $process->start();
            $this->processes[] = $process;
            $deadline = microtime(true) + 20;
            while (!file_exists($ready) || trim((string) file_get_contents($ready)) === '') {
                if ($process->isTerminated()) $this->fail('Seat worker exited: '.$process->getErrorOutput());
                if (microtime(true) > $deadline) $this->fail('Seat worker did not connect.');
                usleep(10000);
            }
            $pids[] = (int) file_get_contents($ready);
        }
        $deadline = microtime(true) + 10;
        do {
            DB::select('select pg_stat_clear_snapshot()');
            $waiting = DB::table('pg_stat_activity')->whereIn('pid', $pids)->where('wait_event_type', 'Lock')->count();
            if ($waiting === 2) break;
            if (microtime(true) > $deadline) break;
            usleep(10000);
        } while (true);
        DB::commit();
        $codes = [];
        foreach ($this->processes as $process) {
            $process->wait();
            $this->assertSame(0, $process->getExitCode(), $process->getErrorOutput());
            $codes[] = trim($process->getOutput());
        }
        sort($codes);
        $this->assertSame(['200', '402'], $codes, 'Only one request may consume the last active team seat.');
        $this->assertSame(2, Staff::where('is_active', true)->count());
        $this->assertSame(2, $waiting, 'Both seat claims must actually contend for the organization lock.');
    }

    public function test_two_invitations_cannot_both_claim_the_last_seat(): void
    {
        $this->race([['invite', 'first@example.test'], ['invite', 'second@example.test']]);
    }

    public function test_two_reactivations_cannot_both_claim_the_last_seat(): void
    {
        $this->race([['reactivate', $this->person(false)->staff->id], ['reactivate', $this->person(false)->staff->id]]);
    }

    public function test_invitation_and_reactivation_share_the_same_seat_lock(): void
    {
        $this->race([['invite', 'new@example.test'], ['reactivate', $this->person(false)->staff->id]]);
    }
}
