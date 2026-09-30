<?php

namespace Tests\Unit\Appointments;

use PHPUnit\Framework\TestCase;

/**
 * reserveSlot() must lock every candidate team member BEFORE it checks any
 * of them, and must lock them in ascending id order (two "any team member"
 * claims for different services that share people would otherwise be able
 * to deadlock). Structural, because the suite's sqlite connection never
 * issues the lock statement.
 */
class SchedulerCandidateLockTest extends TestCase
{
    private function source(): string
    {
        $source = file_get_contents(dirname(__DIR__, 3) . '/app/Services/ServiceSchedulingService.php');
        $this->assertIsString($source);

        return $source;
    }

    private function method(string $name): string
    {
        $source = $this->source();
        $start = strpos($source, "function {$name}(");
        $this->assertNotFalse($start, "{$name}() not found");
        $next = strpos($source, "\n    p", $start + 1); // the next public/private method
        $docblock = strpos($source, "\n    /**", $start + 1);
        $end = min(array_filter([$next, $docblock, strlen($source)], fn ($p) => $p !== false));

        return substr($source, $start, $end - $start);
    }

    public function test_reserve_slot_locks_the_candidates_before_checking_them(): void
    {
        $body = $this->method('reserveSlot');

        $lock = strpos($body, '$this->lockCandidates($masters)');
        $loop = strpos($body, 'foreach ($masters as $master)');

        $this->assertNotFalse($lock, 'reserveSlot() does not call lockCandidates()');
        $this->assertNotFalse($loop);
        $this->assertLessThan($loop, $lock, 'the candidates must be locked before the first conflict check');
    }

    public function test_the_lock_is_taken_in_ascending_id_order_and_only_inside_a_transaction(): void
    {
        $body = $this->method('lockCandidates');

        $this->assertStringContainsString('DB::transactionLevel() === 0', $body, 'a quote (no transaction) must take no lock');
        $this->assertStringContainsString('->sort()', $body, 'ids must be sorted so two claims take the locks in one order');
        $this->assertStringContainsString('AdvisoryLock::within("svcm:{$id}")', $body);
    }

    public function test_the_candidates_are_still_checked_in_their_original_order(): void
    {
        $body = $this->method('reserveSlot');

        // The collection handed to the loop is the one mastersForService()
        // returned — never a sorted copy — so an "any team member" booking
        // lands on the same person it landed on before this change.
        $this->assertStringContainsString('$masters = $this->mastersForService($service, $masterId);', $body);
        $this->assertStringNotContainsString('$masters = $masters->sort', $body);
    }
}
