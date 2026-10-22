<?php

namespace Tests\Feature\Member\Portal;

use PHPUnit\Framework\TestCase;

/**
 * Release 4, part C — the lock order of the payment-intent calls' "reuse or
 * release the earlier intent" step: the room or slot lock first, then (for a
 * stay) the hold row, then `pi:` inside PortalPaymentIntentGuard::
 * reuseOrRelease() — never `pi:` before a booking row (CLAUDE.md).
 *
 * Structural, like tests/Unit/Portal/PortalIntentLockOrderTest.php: the suite
 * runs on sqlite, where AdvisoryLock takes no lock and `lockForUpdate()` is a
 * no-op, so no request-level test can tell one order from another. What can
 * be pinned is the order of the calls in the source.
 */
class PortalIntentReuseLockOrderTest extends TestCase
{
    private function method(string $file, string $signature): string
    {
        $source = file_get_contents(dirname(__DIR__, 4) . '/' . $file);
        $this->assertIsString($source);
        $start = strpos($source, $signature);
        $this->assertNotFalse($start, "{$signature} not found in {$file}");
        $ends = array_filter([strpos($source, "\n    private function ", $start + 1), strpos($source, "\n    public function ", $start + 1), strpos($source, "\n    protected function ", $start + 1)]);

        return substr($source, $start, ($ends ? min($ends) : strlen($source)) - $start);
    }

    public function test_the_stay_call_takes_the_room_lock_then_the_hold_row_then_pi(): void
    {
        $file = 'app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php';
        $outer = $this->method($file, 'public function paymentIntent(');
        $this->assertLessThan(strpos($outer, 'intentForHold('), strpos($outer, 'AdvisoryLock::transaction('), 'the room lock before anything else');

        $inner = $this->method($file, 'private function intentForHold(');
        $row = strpos($inner, 'lockForUpdate()');
        $pi = strpos($inner, 'reuseOrRelease(');
        $this->assertNotFalse($row, 'the hold row is locked');
        $this->assertNotFalse($pi, 'the earlier intent goes through the guard');
        $this->assertLessThan($pi, $row, 'the hold row before `pi:`');
        $this->assertSame(1, substr_count($inner, 'lockForUpdate()'), 'no booking row is locked after `pi:`');
    }

    public function test_the_appointment_call_takes_the_slot_lock_before_pi(): void
    {
        $file = 'app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php';
        $outer = $this->method($file, 'public function paymentIntent(');
        $this->assertLessThan(strpos($outer, 'intentForSlot('), strpos($outer, 'AdvisoryLock::transaction($lockKey'), 'the slot lock before the intent work');

        $inner = $this->method($file, 'private function intentForSlot(');
        $this->assertNotFalse(strpos($inner, 'reuseOrRelease('));
        $this->assertStringNotContainsString('lockForUpdate', $inner, 'no booking row is locked while `pi:` may be held');
    }

    public function test_the_guard_decides_carried_reuse_and_release_under_pi(): void
    {
        $body = $this->method('app/Services/Booking/PortalPaymentIntentGuard.php', 'public function reuseOrRelease(');
        $lock = strpos($body, "AdvisoryLock::transaction('pi:'");
        $this->assertNotFalse($lock);
        $this->assertLessThan(strpos($body, 'carried('), $lock, '"carried" is read under the `pi:` lock');
        $this->assertLessThan(strpos($body, 'cancel('), strpos($body, 'carried('), 'never cancelled before "carried" is known');
        $this->assertStringNotContainsString('lockForUpdate', $body);
    }
}
