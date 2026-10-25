<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\CreditTransaction;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Loyalty\Visits\VisitRecorder;
use App\Services\MemberMergeService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Cashback credit's ledger (release 7, spec 2026-10-25 §3): money, so exact — whole cents, rounded down, the venue's
 * currency on every line, once per reference or key, never below zero — and the invariant the spec pins: after every
 * line the member's latest line states their `credit_balance` (and the lines add up to it), across earn, spend,
 * reverse, adjust, a merge and an erasure.
 */
class CreditLedgerTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, CreditSchema;

    private CreditLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildCreditSchema();
        $this->org->forceFill(['currency' => 'EUR'])->save();
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => true, 'cashback_percent' => 5], $this->manager);
        $this->ledger = app(CreditLedger::class);
    }

    private function visit(?float $amount, int $ref = 77, string $type = 'service_booking', string $source = Visit::APPOINTMENT): Visit
    {
        return new Visit($source, $type, $ref, $amount, '2026-10-05');
    }

    /** The member's lines, oldest first. @return list<CreditTransaction> */
    private function lines(LoyaltyMember $member): array
    {
        return CreditTransaction::withoutGlobalScopes()->where('member_id', $member->id)->orderBy('id')->get()->all();
    }

    private function balance(LoyaltyMember $member): string
    {
        return (string) LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->value('credit_balance');
    }

    /** The spec's invariant: the latest line states the stored balance, and the lines add up to it. */
    private function assertLedgerHolds(LoyaltyMember $member, string $step): void
    {
        $stored = CreditLedger::cents(LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->value('credit_balance'));
        $lines = $this->lines($member);
        $latest = end($lines);
        $this->assertNotFalse($latest, "{$step}: the member has a line");
        $this->assertSame($stored, CreditLedger::cents($latest->getRawOriginal('balance_after')), "{$step}: the latest line's balance_after is the credit_balance");
        $this->assertSame($stored, array_sum(array_map(fn ($l) => CreditLedger::cents($l->getRawOriginal('amount')), $lines)), "{$step}: the lines add up to the balance");
        $this->assertGreaterThanOrEqual(0, $stored, "{$step}: never below zero");
    }

    private function refusal(callable $call): LoyaltyRefused
    {
        try {
            $call();
        } catch (LoyaltyRefused $e) {
            return $e;
        }
        $this->fail('Expected a refusal.');
    }

    // ─── Earning ───────────────────────────────────────────────────────────

    public function test_cashback_is_the_percent_of_the_spend_rounded_down_to_the_cent_in_the_venues_currency(): void
    {
        $answer = $this->ledger->earnCashback($this->grace, $this->visit(44.99));

        // 5 % of 44.99 is 2.2495: 2.24, never 2.25.
        $line = $this->lines($this->grace)[0];
        $this->assertSame(['line_id' => $line->id, 'amount' => 2.24, 'balance' => 2.24, 'currency' => 'EUR'], $answer);
        $this->assertSame(['earn', 224, 224, 'EUR', 'service_booking', 77, 'cashback_service_booking_77', (int) $this->org->id],
            [$line->type, CreditLedger::cents($line->getRawOriginal('amount')), CreditLedger::cents($line->getRawOriginal('balance_after')), $line->currency,
             $line->reference_type, $line->reference_id, $line->idempotency_key, (int) $line->organization_id]);
        $this->assertSame('5% cashback on 44.99 EUR', $line->note);
        $this->assertSame(224, CreditLedger::cents($this->balance($this->grace)));
        // The caller's instance knows the balance, and it is not a change of its own.
        $this->assertSame(224, CreditLedger::cents($this->grace->getAttributes()['credit_balance']));
        $this->assertFalse($this->grace->isDirty('credit_balance'));

        ProgrammeOptions::save($this->org->id, ['cashback_percent' => 2.5], $this->manager);
        // 2.5 % of 10.10 is 0.2525: 0.25.
        $this->assertSame(0.25, $this->ledger->earnCashback($this->grace, $this->visit(10.10, 78))['amount']);
        $this->assertSame(249, CreditLedger::cents($this->balance($this->grace)));
        $this->assertLedgerHolds($this->grace, 'two earns');
    }

    public function test_nothing_is_earned_with_cashback_off_without_a_spend_or_a_reference_or_below_a_cent(): void
    {
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(null)));
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(0.0)));
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(-20.0)));
        $this->assertNull($this->ledger->earnCashback($this->grace, new Visit(Visit::PURCHASE, null, null, 50.0, '2026-10-05')));
        // 5 % of 0.19 is 0.0095: below a cent.
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(0.19)));

        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => false], $this->manager);
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(100.0, 79)));

        $this->assertSame([], $this->lines($this->grace));
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
    }

    public function test_a_rate_outside_the_options_bounds_earns_nothing(): void
    {
        DB::table('hotel_settings')->where('organization_id', $this->org->id)->where('key', 'cashback_percent')->update(['value' => '80']);
        \App\Models\HotelSetting::flushCacheFor($this->org->id);

        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(100.0)));
        $this->assertSame([], $this->lines($this->grace));
    }

    public function test_a_zero_decimal_currency_earns_whole_units_rounded_down(): void
    {
        $this->org->forceFill(['currency' => 'jpy'])->save();

        // 5 % of 1 234 yen is 61.7: 61 yen.
        $this->assertSame(['amount' => 61.0, 'balance' => 61.0, 'currency' => 'JPY'], array_diff_key($this->ledger->earnCashback($this->grace, $this->visit(1234.0)), ['line_id' => 1]));
        // 5 % of 19 yen is 0.95: below one yen.
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(19.0, 80)));
        $this->assertSame('JPY', $this->lines($this->grace)[0]->currency);
        $this->assertLedgerHolds($this->grace, 'a yen earn');
    }

    public function test_a_reference_earns_once_a_repeat_answers_the_same_line_and_another_member_gets_nothing_for_it(): void
    {
        $first = $this->ledger->earnCashback($this->grace, $this->visit(200.0));
        $again = $this->ledger->earnCashback($this->grace, $this->visit(200.0));

        $this->assertSame($first, $again);
        $this->assertCount(1, $this->lines($this->grace));
        $this->assertSame(1000, CreditLedger::cents($this->balance($this->grace)));

        $this->assertNull($this->ledger->earnCashback($this->ada, $this->visit(200.0)));
        $this->assertSame([], $this->lines($this->ada));
    }

    public function test_the_key_is_unique_per_organisation_not_across_them(): void
    {
        $other = $this->otherOrganization();
        // Saved under its own tenant, as its own manager would (ProgrammeOptions stamps the bound organisation on a new row).
        app()->instance('current_organization_id', $other['org']->id);
        ProgrammeOptions::save($other['org']->id, ['cashback_enabled' => true], null);
        app()->instance('current_organization_id', $this->org->id);

        $this->ledger->earnCashback($this->grace, $this->visit(100.0));
        // The other venue's booking 77 is its own reference.
        $this->assertSame(5.0, $this->ledger->earnCashback($other['member'], $this->visit(100.0))['amount']);

        // The database refuses a second line with one key in one organisation, as production's index does.
        $this->expectException(QueryException::class);
        DB::table('credit_transactions')->insert([
            'organization_id' => $this->org->id, 'member_id' => $this->ada->id, 'type' => 'earn', 'amount' => '1.00', 'balance_after' => '1.00',
            'currency' => 'EUR', 'idempotency_key' => 'cashback_service_booking_77', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_the_ledger_writes_the_members_own_organisation_and_currency_whatever_tenant_is_bound(): void
    {
        $other = $this->otherOrganization();
        $other['org']->forceFill(['currency' => 'USD'])->save();
        app()->instance('current_organization_id', $other['org']->id);

        $this->ledger->earnCashback($this->grace, $this->visit(100.0));

        $line = CreditTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame([(int) $this->org->id, 'EUR'], [(int) $line->organization_id, $line->currency]);
        $this->assertSame($other['org']->id, app('current_organization_id'), 'the binding is given back');
    }

    public function test_a_deleted_member_earns_nothing(): void
    {
        app(MemberErasure::class)->erase($this->grace, $this->manager);

        $this->assertNull($this->ledger->earnCashback($this->grace->fresh(), $this->visit(100.0)));
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
    }

    public function test_a_member_who_deleted_their_own_account_earns_spends_and_is_corrected_no_more_even_when_switched_back_on(): void
    {
        $this->ledger->adjust($this->grace, 5.0, 'Before the deletion', $this->manager, 'a-0');
        $this->grace->user->forceFill(['email' => MemberErasure::selfDeletedEmail((int) $this->grace->user_id)])->save();
        // Staff switched the membership back on afterwards: the account is still the deleted one.
        $member = LoyaltyMember::withoutGlobalScopes()->with('user')->findOrFail($this->grace->id);
        $this->assertTrue(MemberErasure::isSelfDeleted($member));
        $this->assertFalse(MemberErasure::isErased($member));

        $this->assertNull($this->ledger->earnCashback($member, $this->visit(100.0)));
        $this->assertSame('already_erased', $this->refusal(fn () => $this->ledger->spend($member, 1.0, $this->staffMember, null, 's-1'))->errorCode);
        $this->assertSame('already_erased', $this->refusal(fn () => $this->ledger->adjust($member, 1.0, 'Back', $this->manager, 'a-1'))->errorCode);
        $this->assertCount(1, $this->lines($this->grace));

        // Another member's id in the stub, or a real address, is not a deletion.
        $this->ada->user->forceFill(['email' => 'deleted-' . ((int) $this->ada->user_id + 1) . '-1761400000@deleted.local'])->save();
        $this->assertFalse(MemberErasure::isSelfDeleted(LoyaltyMember::withoutGlobalScopes()->with('user')->findOrFail($this->ada->id)));
        $this->assertFalse(MemberErasure::isSelfDeleted($this->makeMember('Real Person', 'real@example.test')));
    }

    public function test_a_visit_from_before_cashback_was_switched_on_earns_nothing(): void
    {
        // Switched on on 5 October (setUp): a visit of the 4th, touched again today, earns nothing; the 5th and later do.
        $this->assertSame('2026-10-05', ProgrammeOptions::onSince($this->org->id, 'cashback_enabled'));
        $this->assertNull($this->ledger->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 70, 100.0, '2026-10-04')));
        $this->assertSame(5.0, $this->ledger->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 71, 100.0, '2026-10-05'))['amount']);
        $this->assertSame(5.0, $this->ledger->earnCashback($this->grace, new Visit(Visit::STAY, 'booking_mirror', 72, 100.0, '2026-10-06'))['amount']);

        // Off, then on again on the 20th: the visits of the 10th (while it was off) earn nothing.
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => false], $this->manager);
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-20 09:00:00'));
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => true], $this->manager);
        $this->assertNull($this->ledger->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 73, 100.0, '2026-10-10')));
        $this->assertSame(5.0, $this->ledger->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 74, 100.0, '2026-10-20'))['amount']);

        // A venue whose switched-on day was never kept (on before release 7 kept it): no earlier visit is refused.
        DB::table('hotel_settings')->where('organization_id', $this->org->id)->where('key', ProgrammeOptions::ON_SINCE['cashback_enabled'])->delete();
        \App\Models\HotelSetting::flushCacheFor($this->org->id);
        $this->assertSame(5.0, $this->ledger->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 75, 100.0, '2026-09-01'))['amount']);
        $this->assertCount(4, $this->lines($this->grace));
        $this->assertLedgerHolds($this->grace, 'earns from the switched-on day');
    }

    // ─── Spending at the desk ────────────────────────────────────────────────

    public function test_spending_takes_credit_off_and_is_refused_above_the_balance(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0));           // 10.00

        $done = $this->ledger->spend($this->grace, 4.5, $this->staffMember, 'Coffee and cake', 'k-1');
        $this->assertSame(5.5, $done['balance']);
        $this->assertSame(['spend', -4.5, 5.5, 'EUR', 'Coffee and cake', $this->staffMember->name, false],
            [$done['line']['type'], $done['line']['amount'], $done['line']['balance_after'], $done['currency'], $done['line']['note'], $done['line']['by'], $done['replayed']]);

        $refused = $this->refusal(fn () => $this->ledger->spend($this->grace, 5.51, $this->staffMember, null, 'k-2'));
        $this->assertSame(['credit_short', 422, 5.5], [$refused->errorCode, $refused->status, $refused->extra['balance']]);
        $this->assertCount(2, $this->lines($this->grace));
        $this->assertSame(550, CreditLedger::cents($this->balance($this->grace)));

        $this->ledger->spend($this->grace, 5.5, $this->staffMember, null, 'k-3');
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
        $this->assertLedgerHolds($this->grace, 'spent to zero');
    }

    public function test_a_spend_replayed_with_its_key_answers_the_first_line_and_writes_nothing(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0));
        $first = $this->ledger->spend($this->grace, 3.0, $this->staffMember, null, 'press-1');
        $again = $this->ledger->spend($this->grace, 3.0, $this->staffMember, null, 'press-1');

        $this->assertSame($first['line'], $again['line']);
        $this->assertTrue($again['replayed']);
        $this->assertSame(7.0, $again['balance']);
        $this->assertCount(2, $this->lines($this->grace));

        // The key of a spend is never answered as another kind of line.
        $this->assertSame('key_reused', $this->refusal(fn () => $this->ledger->adjust($this->grace, 1.0, 'Oops', $this->manager, 'press-1'))->errorCode);
    }

    public function test_an_amount_with_more_decimals_than_the_currency_or_not_positive_is_refused(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0));

        foreach ([1.234, 0.0, -1.0, 0.001] as $amount) {
            $refused = $this->refusal(fn () => $this->ledger->spend($this->grace, $amount, $this->staffMember, null, 'k-' . $amount));
            $this->assertSame(['bad_amount', 422, 2], [$refused->errorCode, $refused->status, $refused->extra['decimals']], (string) $amount);
        }
        $this->assertSame('bad_amount', $this->refusal(fn () => $this->ledger->adjust($this->grace, 0.0, 'Nothing', $this->manager, 'a-0'))->errorCode);

        $this->org->forceFill(['currency' => 'JPY'])->save();
        $refused = $this->refusal(fn () => $this->ledger->spend($this->grace, 1.5, $this->staffMember, null, 'yen-1'));
        $this->assertSame(['bad_amount', 0], [$refused->errorCode, $refused->extra['decimals']]);
        $this->assertSame(8.0, $this->ledger->spend($this->grace, 2.0, $this->staffMember, null, 'yen-2')['balance']);
        $this->assertCount(2, $this->lines($this->grace));
    }

    public function test_credit_earned_before_cashback_was_switched_off_can_still_be_spent(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0));
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => false], $this->manager);

        $this->assertSame(0.0, $this->ledger->spend($this->grace, 10.0, $this->staffMember, null, 'k-1')['balance']);
        $this->assertNull($this->ledger->earnCashback($this->grace, $this->visit(200.0, 99)));
    }

    public function test_a_deleted_members_credit_cannot_be_spent_or_corrected(): void
    {
        app(MemberErasure::class)->erase($this->grace, $this->manager);

        $this->assertSame(['already_erased', 409], [($e = $this->refusal(fn () => $this->ledger->spend($this->grace->fresh(), 1.0, $this->staffMember, null, 'k')))->errorCode, $e->status]);
        $this->assertSame('already_erased', $this->refusal(fn () => $this->ledger->adjust($this->grace->fresh(), 5.0, 'Back', $this->manager, 'a'))->errorCode);
    }

    public function test_a_residue_of_cents_after_a_change_to_a_zero_decimal_currency_can_be_corrected_to_exactly_zero(): void
    {
        $this->ledger->adjust($this->grace, 1.4, 'Goodwill in euros', $this->manager, 'a-1');
        $this->org->forceFill(['currency' => 'JPY'])->save();

        // Yen move in whole units: the desk cannot take 0.40 off, nor a correction leave cents behind.
        $this->assertSame('bad_amount', $this->refusal(fn () => $this->ledger->spend($this->grace, 0.4, $this->staffMember, null, 's-1'))->errorCode);
        $this->assertSame('bad_amount', $this->refusal(fn () => $this->ledger->adjust($this->grace, -0.4, 'Part of it', $this->manager, 'a-2'))->errorCode);
        $this->assertSame('bad_amount', $this->refusal(fn () => $this->ledger->adjust($this->grace, 0.5, 'Half a yen', $this->manager, 'a-3'))->errorCode);
        $this->assertSame(140, CreditLedger::cents($this->balance($this->grace)));

        // A correction to exactly zero may: the whole residue goes.
        $done = $this->ledger->adjust($this->grace, -1.4, 'Left from euros', $this->manager, 'a-4');
        $this->assertSame([0.0, -1.4, 'JPY'], [$done['balance'], $done['line']['amount'], $done['currency']]);
        $this->assertTrue($this->ledger->adjust($this->grace, -1.4, 'Left from euros', $this->manager, 'a-4')['replayed']);
        $this->assertCount(2, $this->lines($this->grace));
        $this->assertLedgerHolds($this->grace, 'residue cleared');

        // Whole yen still move as before.
        $this->assertSame(100.0, $this->ledger->adjust($this->grace, 100.0, 'Goodwill', $this->manager, 'a-5')['balance']);
    }

    public function test_a_currency_that_is_not_a_three_letter_code_is_refused_for_a_write(): void
    {
        // organizations.currency is three characters in production; the services setting it falls back to is free text.
        $this->org->forceFill(['currency' => ''])->save();
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'services_currency', 'value' => 'euro', 'type' => 'string',
            'group' => 'booking', 'created_at' => now(), 'updated_at' => now()]);
        \App\Models\HotelSetting::flushCacheFor($this->org->id);

        $refused = $this->refusal(fn () => $this->ledger->earnCashback($this->grace, $this->visit(100.0)));
        $this->assertSame(['bad_currency', 409], [$refused->errorCode, $refused->status]);
        $this->assertSame([], $this->lines($this->grace));
    }

    // ─── Reversal and correction ─────────────────────────────────────────────

    public function test_a_refunded_booking_takes_its_cashback_back_once(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0, 5));
        $this->ledger->reverseFor($this->org->id, 'service_booking', 5, $this->manager);
        $this->ledger->reverseFor($this->org->id, 'service_booking', 5, $this->manager);

        $lines = $this->lines($this->grace);
        $this->assertSame(['earn', 'reverse'], array_map(fn ($l) => $l->type, $lines));
        $this->assertSame([-1000, 'service_booking', 5, 'cashback_reverse_' . $lines[0]->id, $this->manager->id],
            [CreditLedger::cents($lines[1]->getRawOriginal('amount')), $lines[1]->reference_type, $lines[1]->reference_id, $lines[1]->idempotency_key, $lines[1]->created_by]);
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
        $this->assertSame(0, AuditLog::where('action', 'credit.reverse_short')->count());
        $this->assertLedgerHolds($this->grace, 'reversed');

        // Another reference, or another venue's, is untouched.
        $this->ledger->reverseFor($this->org->id, 'booking_mirror', 5);
        $this->assertCount(2, $this->lines($this->grace));
    }

    public function test_a_reversal_never_goes_below_zero_what_was_spent_stays_spent_and_the_shortfall_is_audited(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0, 5));          // +10.00
        $this->ledger->spend($this->grace, 7.0, $this->staffMember, null, 'k-1');   // 3.00 left

        $this->ledger->reverseFor($this->org->id, 'service_booking', 5);
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
        $audit = AuditLog::where('action', 'credit.reverse_short')->sole();
        // JSON keeps 10.0 as 10: compared by value.
        $this->assertEquals(['earned' => 10, 'reversed' => 3, 'shortfall' => 7, 'currency' => 'EUR'], array_intersect_key($audit->new_values, array_flip(['earned', 'reversed', 'shortfall', 'currency'])));
        $this->assertSame([(int) $this->org->id, $this->grace->id], [(int) $audit->organization_id, (int) $audit->subject_id]);

        // Credit earned since is never reversed against the old booking.
        $this->ledger->earnCashback($this->grace, $this->visit(100.0, 6));         // +5.00
        $this->ledger->reverseFor($this->org->id, 'service_booking', 5);
        $this->assertSame(500, CreditLedger::cents($this->balance($this->grace)));
        $this->assertSame(1, AuditLog::where('action', 'credit.reverse_short')->count());

        // Nothing left at all: the reversal is still recorded, at 0, once.
        $this->ledger->spend($this->grace, 5.0, $this->staffMember, null, 'k-2');
        $this->ledger->reverseFor($this->org->id, 'service_booking', 6);
        $last = $this->lines($this->grace)[5];
        $this->assertSame(['reverse', 0], [$last->type, CreditLedger::cents($last->getRawOriginal('amount'))]);
        $this->ledger->reverseFor($this->org->id, 'service_booking', 6);
        $this->assertCount(6, $this->lines($this->grace));
        $this->assertLedgerHolds($this->grace, 'reversed short');
    }

    public function test_a_refund_is_reversed_even_when_the_venues_currency_became_unusable(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0, 5));
        $this->org->forceFill(['currency' => ''])->save();
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'services_currency', 'value' => 'euro', 'type' => 'string',
            'group' => 'booking', 'created_at' => now(), 'updated_at' => now()]);
        \App\Models\HotelSetting::flushCacheFor($this->org->id);

        $this->ledger->reverseFor($this->org->id, 'service_booking', 5);

        $this->assertSame(['reverse', 'EUR'], [$this->lines($this->grace)[1]->type, $this->lines($this->grace)[1]->currency]);
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
    }

    public function test_the_visit_hook_earns_and_takes_back_through_the_ledger(): void
    {
        $recorder = app(VisitRecorder::class);

        $outcome = $recorder->record($this->grace, new Visit(Visit::PURCHASE, 'scan_event', 501, 64.99, '2026-10-05', $this->staffMember));
        $this->assertSame(['amount' => 3.24, 'balance' => 3.24, 'currency' => 'EUR'], array_diff_key((array) $outcome->credit, ['line_id' => 0]));
        $this->assertNotContains('cashback', $outcome->failed);
        $this->assertSame($this->staffMember->id, $this->lines($this->grace)[0]->created_by);

        $recorder->reversed($this->org->id, 'scan_event', 501, $this->manager);
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
        $this->assertLedgerHolds($this->grace, 'through the visit hook');
    }

    public function test_a_managers_correction_goes_either_way_never_below_zero_and_is_audited(): void
    {
        $up = $this->ledger->adjust($this->grace, 12.4, '  Goodwill for the late room ', $this->manager, 'a-1');
        $this->assertSame([12.4, 'adjust', 12.4, 'Goodwill for the late room', $this->manager->name], [$up['balance'], $up['line']['type'], $up['line']['amount'], $up['line']['note'], $up['line']['by']]);

        $down = $this->ledger->adjust($this->grace, -2.4, 'Typed too much', $this->manager, 'a-2');
        $this->assertSame([10.0, -2.4], [$down['balance'], $down['line']['amount']]);

        $refused = $this->refusal(fn () => $this->ledger->adjust($this->grace, -10.01, 'Too far', $this->manager, 'a-3'));
        $this->assertSame(['credit_short', 10.0], [$refused->errorCode, $refused->extra['balance']]);
        $this->assertSame('reason_required', $this->refusal(fn () => $this->ledger->adjust($this->grace, 1.0, '   ', $this->manager, 'a-4'))->errorCode);

        $audits = AuditLog::where('action', 'credit.adjusted')->orderBy('id')->get();
        $this->assertEquals([[12.4, 'Goodwill for the late room'], [-2.4, 'Typed too much']], $audits->map(fn ($a) => [$a->new_values['amount'], $a->new_values['reason']])->all());
        $this->assertSame($this->manager->id, (int) $audits[0]->causer_id);
        $this->assertLedgerHolds($this->grace, 'corrected');
    }

    // ─── The invariant, a merge and an erasure ───────────────────────────────

    public function test_the_latest_line_states_the_balance_after_every_kind_of_write(): void
    {
        $winner = $this->grace;
        $loser = $this->makeMember('Grace H.', 'grace2@example.test');

        $this->ledger->earnCashback($winner, $this->visit(200.0, 1));
        $this->assertLedgerHolds($winner, 'earn');
        $this->ledger->spend($winner, 3.33, $this->staffMember, null, 's-1');
        $this->assertLedgerHolds($winner, 'spend');
        $this->ledger->earnCashback($winner, $this->visit(123.45, 2, 'booking_mirror', Visit::STAY));
        $this->assertLedgerHolds($winner, 'earn on a stay');
        $this->ledger->reverseFor($this->org->id, 'booking_mirror', 2);
        $this->assertLedgerHolds($winner, 'reverse');
        $this->ledger->adjust($winner, 1.11, 'Goodwill', $this->manager, 'a-1');
        $this->assertLedgerHolds($winner, 'adjust');

        // The loser's lines are newer than the winner's: the merge's own line must still be the winner's latest.
        $this->ledger->earnCashback($loser, $this->visit(50.0, 3));
        $this->ledger->spend($loser, 0.5, $this->staffMember, null, 's-2');
        $winnerBefore = CreditLedger::cents($this->balance($winner));
        $loserBefore = CreditLedger::cents($this->balance($loser));

        app(MemberMergeService::class)->merge($winner, $loser, $this->manager->id, 'Two sign-ups');
        $this->assertSame($winnerBefore + $loserBefore, CreditLedger::cents($this->balance($winner)));
        $this->assertLedgerHolds($winner, 'merge');

        $this->ledger->spend($winner->fresh(), 1.0, $this->staffMember, null, 's-3');
        $this->assertLedgerHolds($winner, 'spend after the merge');

        app(MemberErasure::class)->erase($winner->fresh(), $this->manager);
        $this->assertSame(0, CreditLedger::cents($this->balance($winner)));
        $this->assertLedgerHolds($winner, 'erasure');
    }

    public function test_a_merge_adds_the_balances_moves_the_lines_and_zeroes_the_loser(): void
    {
        $loser = $this->makeMember('Grace H.', 'grace2@example.test');
        $this->ledger->earnCashback($this->grace, $this->visit(100.0, 1));            // 5.00
        $this->ledger->earnCashback($loser, $this->visit(48.0, 2));                   // 2.40

        app(MemberMergeService::class)->merge($this->grace, $loser, $this->manager->id);

        $this->assertSame(740, CreditLedger::cents($this->balance($this->grace)));
        $lines = $this->lines($this->grace);
        $this->assertSame(['earn', 'earn', 'adjust', 'adjust'], array_map(fn ($l) => $l->type, $lines));
        [, , $out, $in] = $lines;
        $this->assertSame([-240, 0, 'member_merge', $this->grace->id, "credit_merge_{$loser->id}_out"],
            [CreditLedger::cents($out->getRawOriginal('amount')), CreditLedger::cents($out->getRawOriginal('balance_after')), $out->reference_type, $out->reference_id, $out->idempotency_key]);
        $this->assertSame([240, 740, 'member_merge', $loser->id, "credit_merge_{$loser->id}_in"],
            [CreditLedger::cents($in->getRawOriginal('amount')), CreditLedger::cents($in->getRawOriginal('balance_after')), $in->reference_type, $in->reference_id, $in->idempotency_key]);
        $this->assertSame(0, CreditTransaction::withoutGlobalScopes()->where('member_id', $loser->id)->count());
        $this->assertNull(LoyaltyMember::withoutGlobalScopes()->find($loser->id));

        // A loser with no credit and no lines adds nothing and leaves no line.
        $empty = $this->makeMember('Nobody', 'nobody@example.test');
        app(MemberMergeService::class)->merge($this->grace->fresh(), $empty, $this->manager->id);
        $this->assertCount(4, $this->lines($this->grace));
        $this->assertSame(740, CreditLedger::cents($this->balance($this->grace)));
    }

    public function test_a_loser_with_lines_but_no_balance_still_leaves_the_winners_balance_as_the_latest_line(): void
    {
        $loser = $this->makeMember('Grace H.', 'grace2@example.test');
        $this->ledger->earnCashback($this->grace, $this->visit(100.0, 1));
        $this->ledger->earnCashback($loser, $this->visit(48.0, 2));
        $this->ledger->spend($loser, 2.4, $this->staffMember, null, 's-1');

        app(MemberMergeService::class)->merge($this->grace, $loser, $this->manager->id);

        $latest = collect($this->lines($this->grace))->last();
        $this->assertSame(['adjust', 0, 500], [$latest->type, CreditLedger::cents($latest->getRawOriginal('amount')), CreditLedger::cents($latest->getRawOriginal('balance_after'))]);
        $this->assertLedgerHolds($this->grace, 'merge of a spent loser');
    }

    public function test_erasure_forfeits_the_balance_keeps_the_lines_and_audits_the_amount(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(250.0, 1));            // 12.50

        app(MemberErasure::class)->erase($this->grace, $this->manager);

        $lines = $this->lines($this->grace);
        $this->assertSame(['earn', 'adjust'], array_map(fn ($l) => $l->type, $lines));
        $this->assertSame([-1250, 0, 'Forfeited at erasure', 'member_erasure', $this->manager->id],
            [CreditLedger::cents($lines[1]->getRawOriginal('amount')), CreditLedger::cents($lines[1]->getRawOriginal('balance_after')), $lines[1]->note, $lines[1]->reference_type, $lines[1]->created_by]);
        $this->assertSame(0, CreditLedger::cents($this->balance($this->grace)));
        $audit = AuditLog::where('action', 'credit.forfeited_on_erasure')->sole();
        $this->assertEquals([12.5, 'EUR', $lines[1]->id], [$audit->new_values['amount'], $audit->new_values['currency'], $audit->new_values['line_id']]);
        $this->assertSame(1, AuditLog::where('action', 'member_deleted')->count());

        // A member with no credit forfeits nothing: no line, no audit.
        app(MemberErasure::class)->erase($this->ada, $this->manager);
        $this->assertSame([], $this->lines($this->ada));
        $this->assertSame(1, AuditLog::where('action', 'credit.forfeited_on_erasure')->count());
    }

    // ─── The screens' reads ──────────────────────────────────────────────────

    public function test_the_workspace_reads_pages_of_lines_newest_first_with_who_wrote_them(): void
    {
        $this->ledger->earnCashback($this->grace, $this->visit(200.0, 1));
        foreach (range(1, 26) as $n) {
            $this->ledger->spend($this->grace, 0.1, $this->staffMember, "Spend {$n}", "k-{$n}");
        }

        $page = $this->ledger->forMember($this->grace);
        $this->assertSame([true, 7.4, 'EUR'], [$page['enabled'], $page['balance'], $page['currency']]);
        $this->assertSame(['page' => 1, 'pages' => 2, 'total' => 27, 'per_page' => 25], $page['pagination']);
        $this->assertCount(25, $page['lines']);
        $this->assertSame(['spend', -0.1, 7.4, 'Spend 26', $this->staffMember->name],
            [$page['lines'][0]['type'], $page['lines'][0]['amount'], $page['lines'][0]['balance_after'], $page['lines'][0]['note'], $page['lines'][0]['by']]);
        $this->assertSame(['id', 'type', 'amount', 'balance_after', 'currency', 'note', 'reference_type', 'created_at', 'by'], array_keys($page['lines'][0]));

        $second = $this->ledger->forMember($this->grace, 2);
        $this->assertSame(['earn', null], [$second['lines'][1]['type'], $second['lines'][1]['by']]);
        $this->assertSame(2, $this->ledger->forMember($this->grace, 9)['pagination']['page']);

        $own = $this->ledger->forMemberSelf($this->grace);
        $this->assertCount(20, $own['lines']);
        $this->assertArrayNotHasKey('by', $own['lines'][0]);
        $this->assertSame([true, 7.4, 'EUR'], [$own['enabled'], $own['balance'], $own['currency']]);
    }
}
