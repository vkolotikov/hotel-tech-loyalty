<?php

namespace Tests\Feature\Booking;

use App\Services\Booking\RefundNotSettled;
use App\Services\Booking\RefundOperations;
use App\Services\StripeService;
use Illuminate\Support\Facades\DB;
use Mockery;
use Stripe\Refund;
use Tests\TestCase;

class RefundOperationsTest extends TestCase
{
    private int $org;
    protected function setUp(): void { parent::setUp(); $this->org = random_int(9000000, 9999999); }
    protected function tearDown(): void { RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->delete(); Mockery::close(); parent::tearDown(); }
    private function request($stripe, ?float $amount = 25, float $before = 0): Refund
    {
        return app(RefundOperations::class)->request($stripe, $this->org, 'pi_lifecycle', $amount, 'EUR', 'service', 7, $before);
    }
    private function refund(string $status, string $id = 're_lifecycle'): Refund
    {
        return Refund::constructFrom(['id' => $id, 'status' => $status, 'amount' => 2500, 'currency' => 'eur', 'payment_intent' => 'pi_lifecycle']);
    }
    private function refused(callable $work, string $code): void
    {
        try { $work(); $this->fail('Refund must not be reported as completed'); }
        catch (RefundNotSettled $e) { $this->assertSame($code, $e->errorCode); }
    }
    public function test_operator_inspection_is_read_only_and_can_be_scoped_to_one_organization(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('pending'));
        $this->refused(fn () => $this->request($stripe), 'refund_pending');
        $before = RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->first();
        $this->artisan('refunds:inspect', ['--organization' => (string) $this->org])->expectsOutput('1 operation(s). Read-only; no refunds were requested.')->assertSuccessful();
        $this->artisan('refunds:inspect', ['--organization' => (string) ($this->org + 1)])->expectsOutput('0 operation(s). Read-only; no refunds were requested.')->assertSuccessful();
        $this->assertEquals($before, RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->first());
    }

    public function test_a_fractional_yen_refund_is_refused_before_operation_or_provider_write(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldNotReceive('refund');
        try {
            app(RefundOperations::class)->request($stripe, $this->org, 'pi_yen_precision', 25.50, 'JPY', 'service', 7, 0);
            $this->fail('Unrepresentable money must not be rounded');
        } catch (RefundNotSettled $e) {
            $this->assertSame('invalid_amount', $e->errorCode);
            $this->assertSame(422, $e->httpStatus());
        }
        $this->assertSame(0, RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->count());
    }
    public function test_pending_refund_reserves_the_payment_and_retries_its_id_until_settled(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('pending'));
        $stripe->shouldReceive('retrieveRefund')->once()->with('re_lifecycle')->andReturn($this->refund('succeeded'));
        $this->refused(fn () => $this->request($stripe), 'refund_pending');
        $this->assertCount(1, RefundOperations::pending($this->org, 'pi_lifecycle'));
        $this->refused(fn () => $this->request($stripe, 30), 'refund_pending');
        $this->assertSame('succeeded', $this->request($stripe)->status);
        $this->assertSame([], RefundOperations::pending($this->org, 'pi_lifecycle', 25));
    }
    public function test_unknown_operation_survives_a_booking_rollback_and_keeps_the_same_key(): void
    {
        $keys = [];
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->twice()->andReturnUsing(function ($pi, $amount, $reason, $key) use (&$keys) {
            $keys[] = $key;
            if (count($keys) === 1) throw new \RuntimeException('Transport timed out');
            return $this->refund('succeeded');
        });
        $this->refused(fn () => DB::transaction(fn () => $this->request($stripe)), 'refund_outcome_unknown');
        $this->assertSame('unknown', RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->value('status'));
        $this->refused(fn () => $this->request($stripe, 30), 'refund_outcome_unknown');
        $this->assertSame('succeeded', $this->request($stripe)->status);
        $this->assertSame($keys[0], $keys[1]);
    }
    public function test_a_definite_failure_allows_a_new_attempt_with_a_new_identity(): void
    {
        $keys = [];
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->twice()->andReturnUsing(function ($pi, $amount, $reason, $key) use (&$keys) { $keys[] = $key; return $this->refund(count($keys) === 1 ? 'failed' : 'succeeded', 're_' . count($keys)); });
        $this->refused(fn () => $this->request($stripe), 'refund_failed');
        $this->assertSame('succeeded', $this->request($stripe)->status);
        $this->assertNotSame($keys[0], $keys[1]);
    }
    public function test_a_successful_refund_whose_booking_write_rolled_back_is_recovered_before_any_new_amount(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('succeeded'));
        $stripe->shouldReceive('retrieveRefund')->once()->andReturn($this->refund('succeeded'));
        try { DB::transaction(function () use ($stripe) { $this->request($stripe); RefundOperations::applied($this->org, 're_lifecycle'); throw new \RuntimeException('Booking save failed'); }); } catch (\RuntimeException) {}
        $this->refused(fn () => $this->request($stripe, 30), 'refund_pending');
        $this->assertSame('re_lifecycle', $this->request($stripe)->id);
        $this->assertNull(RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->value('applied_at'));
        $this->assertCount(1, RefundOperations::pending($this->org, 'pi_lifecycle', 0));
    }
    public function test_a_full_refund_keeps_its_null_request_identity_after_provider_returns_the_amount(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('pending'));
        $stripe->shouldReceive('retrieveRefund')->once()->andReturn($this->refund('succeeded'));
        $this->refused(fn () => $this->request($stripe, null), 'refund_pending');
        $this->assertSame('succeeded', $this->request($stripe, null)->status);
    }
    public function test_another_organisation_cannot_observe_or_complete_an_operation(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('pending'));
        $this->refused(fn () => $this->request($stripe), 'refund_pending');
        app(RefundOperations::class)->observe($this->org + 1, $this->refund('succeeded'));
        RefundOperations::applied($this->org + 1, 're_lifecycle');
        $row = RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->first();
        $this->assertSame('pending', $row->status);
        $this->assertNull($row->applied_at);
    }

    public function test_a_read_permission_failure_does_not_turn_an_existing_refund_into_a_declined_attempt(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('pending'));
        $stripe->shouldReceive('retrieveRefund')->once()->andThrow(\Stripe\Exception\PermissionException::factory('Restricted key', 403));
        $this->refused(fn () => $this->request($stripe), 'refund_pending');
        $this->refused(fn () => $this->request($stripe), 'refund_outcome_unknown');
        $this->refused(fn () => $this->request($stripe, 30), 'refund_outcome_unknown');
        $this->assertCount(1, RefundOperations::pending($this->org, 'pi_lifecycle'));
    }

    public function test_an_expired_unknown_provider_key_is_reconciled_but_never_sent_as_a_new_refund(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andThrow(new \RuntimeException('Timed out'));
        $this->refused(fn () => $this->request($stripe), 'refund_outcome_unknown');
        RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->update(['created_at' => now()->subDays(2)]);
        $stripe->shouldReceive('refundsForPaymentIntent')->once()->andReturn([]);
        $this->refused(fn () => $this->request($stripe), 'refund_outcome_unknown');
        $this->assertCount(1, RefundOperations::pending($this->org, 'pi_lifecycle'));
    }

    public function test_postgresql_journal_is_visible_on_an_independent_connection_while_booking_transaction_is_open(): void
    {
        if (DB::getDriverName() !== 'pgsql') $this->markTestSkipped('Requires migrated PostgreSQL and independent connections.');
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('refund')->once()->andReturn($this->refund('pending'));
        DB::beginTransaction();
        try {
            DB::statement("set local lock_timeout = '2s'");
            $this->refused(fn () => $this->request($stripe), 'refund_pending');
            $this->assertSame('pending', DB::table('refund_operations')->where('organization_id', $this->org)->value('status'));
        } finally { DB::rollBack(); }
        $this->assertSame('pending', DB::table('refund_operations')->where('organization_id', $this->org)->value('status'));
    }

    public function test_postgresql_concurrent_operators_share_one_provider_identity_without_deadlock(): void
    {
        if (DB::getDriverName() !== 'pgsql') $this->markTestSkipped('Requires migrated PostgreSQL and independent processes.');
        $file = tempnam(sys_get_temp_dir(), 'refund-keys-');
        $source = <<<'PHP'
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$stripe = Mockery::mock(App\Services\StripeService::class);
$stripe->shouldReceive('refund')->andReturnUsing(function($pi,$amount,$reason,$key) use ($argv) {
    file_put_contents($argv[3], $key.PHP_EOL, FILE_APPEND|LOCK_EX);
    usleep(150000);
    return Stripe\Refund::constructFrom(['id'=>'re_concurrent','status'=>'succeeded','payment_intent'=>$pi,'amount'=>2500,'currency'=>'eur']);
});
$stripe->shouldReceive('retrieveRefund')->andReturn(Stripe\Refund::constructFrom(['id'=>'re_concurrent','status'=>'succeeded','payment_intent'=>'pi_lifecycle','amount'=>2500,'currency'=>'eur']));
app(App\Services\Booking\RefundOperations::class)->request($stripe,(int)$argv[2],'pi_lifecycle',25,'EUR','service',7,0);
PHP;
        $processes = [];
        try {
            for ($i = 0; $i < 2; $i++) {
                $process = new \Symfony\Component\Process\Process([PHP_BINARY, '-d', 'max_execution_time=0', '-r', $source, base_path(), (string) $this->org, $file]);
                $process->setTimeout(15);
                $process->start();
                $processes[] = $process;
            }
            foreach ($processes as $process) { $process->wait(); $this->assertTrue($process->isSuccessful(), $process->getErrorOutput()); }
            $keys = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $this->assertCount(1, array_unique($keys));
            $this->assertSame(1, RefundOperations::connection()->table('refund_operations')->where('organization_id', $this->org)->count());
        } finally { foreach ($processes as $process) if ($process->isRunning()) $process->stop(); unlink($file); }
    }
}
