<?php

namespace Tests\Feature\Member\Portal;

use PHPUnit\Framework\TestCase;

/**
 * Release 4, part C — the lock order of the payment-intent calls' "reuse or
 * release the earlier intent" step: for a stay the hold row, then `pi:`; for
 * an appointment the member's own `psi:` key, then `pi:` — inside
 * PortalPaymentIntentGuard::reuseOrRelease(), never `pi:` before a booking
 * row (CLAUDE.md), and never a room or slot key the public widget's confirms
 * also take (a slow Stripe call would hold up their bookings).
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

    /** The method's code without its comments (which name the very keys it must not take). */
    private function code(string $method): string
    {
        $out = '';
        foreach (token_get_all('<?php ' . $method) as $t) {
            if (is_array($t) && in_array($t[0], [T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG], true)) {
                continue;
            }
            $out .= is_array($t) ? $t[1] : $t;
        }

        return $out;
    }

    public function test_the_stay_call_takes_the_hold_row_then_pi_and_no_room_lock(): void
    {
        $file = 'app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php';
        $outer = $this->method($file, 'public function paymentIntent(');
        $this->assertLessThan(strpos($outer, 'intentForHold('), strpos($outer, 'DB::transaction('), 'one transaction around the intent work');
        // Review finding 1: the widget's confirms take `room:` too; a slow Stripe call must not hold it.
        $this->assertStringNotContainsString('AdvisoryLock', $this->code($outer));
        $this->assertStringNotContainsString('room:', $this->code($outer));

        $inner = $this->method($file, 'private function intentForHold(');
        $row = strpos($inner, 'lockForUpdate()');
        $pi = strpos($inner, 'reuseOrRelease(');
        $this->assertNotFalse($row, 'the hold row is locked');
        $this->assertNotFalse($pi, 'the earlier intent goes through the guard');
        $this->assertLessThan($pi, $row, 'the hold row before `pi:`');
        $this->assertSame(1, substr_count($inner, 'lockForUpdate()'), 'no booking row is locked after `pi:`');
        $this->assertStringNotContainsString('AdvisoryLock', $inner);
    }

    public function test_the_appointment_call_takes_only_the_members_own_key_before_pi(): void
    {
        $file = 'app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php';
        $outer = $this->method($file, 'public function paymentIntent(');
        $this->assertLessThan(strpos($outer, 'intentForSlot('), strpos($outer, 'AdvisoryLock::transaction($lockKey'), 'the member\'s own key before the intent work');
        $this->assertStringContainsString("\$lockKey = 'psi:' . \$orgId . ':' . \$memberId", $outer);
        // Review finding 1: never the slot keys the widget's and the portal's confirms take.
        $this->assertStringNotContainsString('svcm:', $this->code($outer));
        $this->assertStringNotContainsString('svc:', $this->code($outer));
        $this->assertSame(1, substr_count($this->code($outer), 'buildQuote('), 'the quote runs once, before any lock (inside a transaction the scheduler would take `svcm:`)');
        $this->assertLessThan(strpos($outer, 'AdvisoryLock::transaction('), strpos($outer, 'buildQuote('));

        $inner = $this->method($file, 'private function intentForSlot(');
        $this->assertNotFalse(strpos($inner, 'reuseOrRelease('));
        $this->assertStringNotContainsString('buildQuote', $inner);
        $this->assertStringNotContainsString('lockForUpdate', $inner, 'no booking row is locked while `pi:` may be held');
        $this->assertStringContainsString('SharedCache::store()', $inner, 'the slot record every container sees');
    }

    public function test_the_guard_decides_carried_reuse_and_release_under_pi(): void
    {
        $body = $this->method('app/Services/Booking/PortalPaymentIntentGuard.php', 'public function reuseOrRelease(');
        $lock = strpos($body, "AdvisoryLock::transaction('pi:'");
        $this->assertNotFalse($lock);
        $this->assertLessThan(strpos($body, 'carried('), $lock, '"carried" is read under the `pi:` lock');
        $this->assertLessThan(strpos($body, 'cancelPaymentIntent('), strpos($body, 'carried('), 'never cancelled before "carried" is known');
        // Review finding 2: a cancel that fails is not swallowed — nothing is minted beside an intent of unknown fate.
        $this->assertLessThan(strpos($body, 'throw new PaymentUnverifiable'), strpos($body, 'cancelPaymentIntent('));
        $this->assertStringNotContainsString('lockForUpdate', $body);
    }
}
