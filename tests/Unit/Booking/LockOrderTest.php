<?php

namespace Tests\Unit\Booking;

use PHPUnit\Framework\TestCase;

/**
 * Release 6, items 3 and 4 — the order of the locks, pinned in the source
 * (the suite's sqlite takes no advisory or row lock, so no request here can
 * tell one order from another; PostgreSQL runs of WidgetStayUnderLockTest and
 * AnyMasterSlotLockTest show the real sequence).
 *
 * Item 3: the public widget's own combination (BookingEngineService::
 * confirmCombo() without hooks) takes every room's `room:` lock once,
 * ascending (StayCombination::roomLockKeys()), then the hold row, re-checks
 * every room, then the payment, and only then asks the PMS.
 *
 * Item 4: an "any staff member" confirm locks `svc:{service}` and — inside its
 * transaction — the scheduler's reserveSlot() locks every candidate's
 * `svcm:{master}` in ascending id order before it checks any of them
 * (ServiceSchedulingService::lockCandidates(), SchedulerCandidateLockTest), so
 * it serialises with a confirm naming one of those masters. That holds for the
 * public services confirm and the portal's (where the slot locks come before
 * `pi:`); the appointments workspace always names the master (`svcm:` first).
 */
class LockOrderTest extends TestCase
{
    private function method(string $file, string $signature): string
    {
        $source = file_get_contents(dirname(__DIR__, 3) . '/' . $file);
        $this->assertIsString($source);
        $start = strpos($source, $signature);
        $this->assertNotFalse($start, "{$signature} not found in {$file}");
        $ends = array_filter([
            strpos($source, "\n    private function ", $start + 1),
            strpos($source, "\n    public function ", $start + 1),
            strpos($source, "\n    protected function ", $start + 1),
        ], fn ($p) => $p !== false);

        return substr($source, $start, ($ends ? min($ends) : strlen($source)) - $start);
    }

    /** Positions of $needles in $haystack, each after the previous one; fails on a missing or out-of-order one. */
    private function assertInOrder(string $haystack, array $needles, string $what): void
    {
        $from = 0;
        foreach ($needles as $needle) {
            $at = strpos($haystack, $needle, $from);
            $this->assertNotFalse($at, "{$what}: `{$needle}` missing, or before the step it must follow");
            $from = $at + strlen($needle);
        }
    }

    public function test_the_widgets_combination_locks_every_room_then_the_hold_then_rechecks_before_the_pms(): void
    {
        $body = $this->method('app/Services/BookingEngineService.php', 'public function confirmCombo(');
        // The portal's own combination branches off first; everything after is the widget's.
        $widget = substr($body, (int) strpos($body, 'return $this->confirmMemberCombo('));

        $this->assertInOrder($widget, [
            'DB::transaction(',
            'StayCombination::roomLockKeys((int) $orgId, array_column($rooms, \'unit_id\'))',
            'AdvisoryLock::within($roomLock)',
            "BookingHold::where('id', \$hold->id)->lockForUpdate()->first()",
            '$this->assertComboRoomStillFree(',
            '$this->assertWidgetPaymentStillPayable(',
            "\$locked->update(['status' => 'consumed'])",
            '$this->smoobu->createReservation(',
        ], 'the widget combination');
        $this->assertSame(1, substr_count($widget, 'AdvisoryLock::within('), 'one lock call, in a loop over the sorted keys');
    }

    public function test_room_lock_keys_are_each_room_once_ascending(): void
    {
        $body = $this->method('app/Services/Booking/StayCombination.php', 'public static function roomLockKeys(');
        $this->assertStringContainsString('array_unique(', $body);
        $this->assertStringContainsString('sort($ids, SORT_NATURAL)', $body);
    }

    public function test_the_single_room_confirm_rechecks_the_widgets_payment_after_the_hold_and_before_the_pms(): void
    {
        $body = $this->method('app/Services/BookingEngineService.php', 'public function confirm(');

        $this->assertInOrder($body, [
            'AdvisoryLock::within($lockKey)',
            "BookingHold::where('id', \$hold->id)->lockForUpdate()->first()",
            '$this->assertWidgetPaymentStillPayable($data, $failures)',
            '$hooks?->beforeReservation($payload)',
            '$this->smoobu->createReservation($smoobuPayload)',
            'BookingMirror::create(',
        ], 'the single-room confirm');
    }

    public function test_the_public_services_any_master_confirm_reserves_inside_its_slot_lock_transaction(): void
    {
        $body = $this->method('app/Http/Controllers/Api/V1/ServicePublicController.php', 'public function confirm(');

        $this->assertStringContainsString('"svc:{$service->id}"', $body, '"any staff member" locks the service');
        $this->assertStringContainsString('"svcm:{$data[\'service_master_id\']}"', $body);
        // Inside the transaction, so reserveSlot() takes every candidate's `svcm:` (lockCandidates() needs a transaction).
        $this->assertInOrder($body, ['DB::transaction(', 'AdvisoryLock::within($lockKey)', '$scheduler->reserveSlot('], 'the public services confirm');
        $this->assertStringNotContainsString("'pi:'", $body, 'no `pi:` before or among the slot locks');
    }

    public function test_the_portals_any_master_confirm_takes_the_slot_locks_before_pi(): void
    {
        $file = 'app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php';
        $confirm = $this->method($file, 'public function confirm(');
        $this->assertStringContainsString('$lockKey = $masterId ? "svcm:{$masterId}" : "svc:{$data[\'service_id\']}";', $confirm);
        $this->assertStringContainsString('$this->lockedWrite($lockKey,', $confirm);
        $this->assertStringContainsString('AdvisoryLock::transaction($lockKey, $write)', $this->method($file, 'private function lockedWrite('));

        // The quote (reserveSlot(), and with it every candidate's `svcm:`) before `pi:`.
        $this->assertInOrder($this->method($file, 'private function writeBooking('), [
            '$this->buildQuote($request, $data, $builder)',
            "AdvisoryLock::within('pi:' . \$piId)",
        ], 'the portal service confirm');
        $this->assertStringContainsString('$this->scheduler->reserveSlot(', $this->method('app/Services/Booking/ServiceQuoteBuilder.php', 'public function build('));
    }

    public function test_the_scheduler_locks_every_candidate_master_before_checking_any(): void
    {
        $body = $this->method('app/Services/ServiceSchedulingService.php', 'public function reserveSlot(');
        $this->assertInOrder($body, ['$this->lockCandidates($masters)', 'foreach ($masters as $master)'], 'reserveSlot()');
        $lock = $this->method('app/Services/ServiceSchedulingService.php', 'private function lockCandidates(');
        $this->assertStringContainsString("->pluck('id')->sort()", $lock);
        $this->assertStringContainsString('AdvisoryLock::within("svcm:{$id}")', $lock);
    }
}
