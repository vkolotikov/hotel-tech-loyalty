<?php

namespace Tests\Feature\Auth;

use App\Models\EmailVerificationCode;
use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Real committed fixtures and independent processes exercise PostgreSQL row locks. */
class PlatformConcurrencyTest extends TestCase
{
    private ?Organization $org = null;
    private array $users = [];
    private array $files = [];
    private array $processes = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::getDriverName() !== 'pgsql') $this->markTestSkipped('Requires isolated migrated PostgreSQL test database.');
        $this->assertTrue(app()->environment('testing') && str_contains(DB::connection()->getDatabaseName(), 'test'));
        $this->org = Organization::create(['name' => 'Platform race fixture', 'slug' => 'platform-race-'.bin2hex(random_bytes(6))]);
        app()->instance('current_organization_id', $this->org->id);
    }

    protected function tearDown(): void
    {
        foreach ($this->processes as $process) if ($process->isRunning()) $process->stop();
        foreach ($this->files as $file) if (file_exists($file)) unlink($file);
        if ($this->org !== null) {
            DB::table('audit_logs')->where('organization_id', $this->org->id)->delete();
        }
        foreach ($this->users as $user) {
            EmailVerificationCode::where('user_id', $user->id)->delete();
            $user->tokens()->delete();
            $user->delete();
        }
        $this->org?->delete();
        app()->forgetInstance('current_organization_id');
        parent::tearDown();
    }

    private function owner(): User
    {
        $user = User::create(['name' => 'Race owner', 'email' => bin2hex(random_bytes(8)).'@example.test', 'password' => 'Original123!', 'user_type' => 'staff', 'organization_id' => $this->org->id]);
        Staff::create(['user_id' => $user->id, 'role' => 'super_admin', 'is_active' => true]);
        $this->users[] = $user;
        return $user;
    }

    private function race(string $mode, array $inputs): array
    {
        $go = tempnam(sys_get_temp_dir(), 'hexa-go-');
        unlink($go);
        $this->files[] = $go;
        $readyFiles = [];
        foreach ($inputs as [$userId, $argument]) {
            $ready = tempnam(sys_get_temp_dir(), 'hexa-ready-');
            unlink($ready);
            $this->files[] = $ready;
            $readyFiles[] = $ready;
            $process = new Process([PHP_BINARY, '-d', 'max_execution_time=0', base_path('tests/Support/platform-race-worker.php'), $mode, (string) $userId, (string) $argument, $ready, $go], base_path(), null, null, 30);
            $process->start();
            $this->processes[] = $process;
        }
        $deadline = microtime(true) + 20;
        while (count(array_filter($readyFiles, 'file_exists')) !== count($readyFiles)) {
            foreach ($this->processes as $process) {
                if ($process->isTerminated()) $this->fail('Worker exited before barrier: '.$process->getErrorOutput());
            }
            if (microtime(true) > $deadline) $this->fail('Workers did not reach barrier.');
            usleep(10000);
        }
        touch($go);
        $codes = [];
        foreach ($this->processes as $process) {
            $process->wait();
            $this->assertSame(0, $process->getExitCode(), $process->getErrorOutput());
            $codes[] = trim($process->getOutput());
        }
        sort($codes);
        return $codes;
    }

    public function test_concurrent_recovery_consumes_code_exactly_once(): void
    {
        $user = $this->owner();
        $token = $user->createToken('old-token')->accessToken;
        $code = EmailVerificationCode::issueFor($user, 'reset', now()->addHour());
        $this->assertSame(['200', '422'], $this->race('recover', [[$user->id, $code->code], [$user->id, $code->code]]));
        $this->assertNotNull($code->fresh()->verified_at);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->id]);
    }

    public function test_simultaneous_owner_demotions_leave_one_active_owner(): void
    {
        $first = $this->owner();
        $second = $this->owner();
        $this->assertSame(['200', '422'], $this->race('demote', [[$first->id, $first->staff->id], [$second->id, $second->staff->id]]));
        $this->assertSame(1, Staff::where('role', 'super_admin')->where('is_active', true)->count());
    }

    public function test_concurrent_claim_and_reset_cannot_both_replace_the_password(): void
    {
        $user = $this->owner();
        $claim = EmailVerificationCode::issueFor($user, 'claim', now()->addDay());
        $reset = EmailVerificationCode::issueFor($user, 'reset', now()->addHour());
        $this->assertSame(['200', '422'], $this->race('recover_mixed', [
            [$user->id, 'claim:' . $claim->code], [$user->id, 'reset:' . $reset->code],
        ]));
        $this->assertNotNull($claim->fresh()->verified_at);
        $this->assertNotNull($reset->fresh()->verified_at);
    }
}
