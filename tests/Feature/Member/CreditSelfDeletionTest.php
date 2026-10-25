<?php

namespace Tests\Feature\Member;

use App\Models\AuditLog;
use App\Models\CreditTransaction;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\User;
use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Portal\PortalBootstrap;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;

/**
 * A member's own account deletion (DELETE /v1/member/account, the app and the portal) and cashback credit (release 7,
 * spec 2026-10-25 §3): the balance is forfeited as at a staff erasure — an `adjust` line to zero, audited
 * `credit.forfeited_on_erasure` — the ledger rows stay, and the deleted member earns, spends and is corrected no more.
 * Driven through the real endpoint with a real token, as MemberAccountDeletionTest (which keeps the deletion safe on
 * PostgreSQL: `qr_code_token` is NOT NULL).
 */
class CreditSelfDeletionTest extends MemberEndpointTestCase
{
    use CreditSchema;

    private const ENDPOINT = '/api/v1/member/account';

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['avatar_url' => 'string', 'nationality' => 'string', 'date_of_birth' => 'date'] as $column => $type) {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('users', $column)) {
                \Illuminate\Support\Facades\Schema::table('users', fn ($t) => $t->{$type}($column)->nullable());
            }
        }
        $this->buildCreditSchema();
    }

    /** @return array{org: Organization, user: User, member: LoyaltyMember, token: string} */
    private function memberWithCredit(float $spend): array
    {
        $org = $this->tenant();
        ['user' => $user, 'member' => $member, 'token' => $token] = $this->member($org);
        ProgrammeOptions::save($org->id, ['cashback_enabled' => true, 'cashback_percent' => 5], null);
        if ($spend > 0) {
            app(CreditLedger::class)->earnCashback($member, new Visit(Visit::APPOINTMENT, 'service_booking', 900 + $member->id, $spend, PortalBootstrap::venueToday($org->id)->toDateString()));
        }

        return ['org' => $org, 'user' => $user, 'member' => $member, 'token' => $token];
    }

    private function deleteOwnAccount(string $token): void
    {
        $this->withToken($token)->deleteJson(self::ENDPOINT, ['password' => 'Sup3rSecret!1', 'confirmation' => 'DELETE'])->assertOk();
    }

    public function test_deleting_ones_own_account_forfeits_the_credit_keeps_the_lines_and_audits_it(): void
    {
        ['user' => $user, 'member' => $member, 'token' => $token] = $this->memberWithCredit(248.0);   // 12.40
        $this->assertSame(1240, CreditLedger::cents(LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->value('credit_balance')));

        $this->deleteOwnAccount($token);

        $lines = CreditTransaction::withoutGlobalScopes()->where('member_id', $member->id)->orderBy('id')->get();
        $this->assertSame(['earn', 'adjust'], $lines->pluck('type')->all());
        $forfeit = $lines[1];
        $this->assertSame([-1240, 0, 'Forfeited at erasure', 'member_erasure', null],
            [CreditLedger::cents($forfeit->getRawOriginal('amount')), CreditLedger::cents($forfeit->getRawOriginal('balance_after')), $forfeit->note, $forfeit->reference_type, $forfeit->created_by]);
        $this->assertSame(0, CreditLedger::cents(LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->value('credit_balance')));

        $audit = AuditLog::withoutGlobalScopes()->where('action', 'credit.forfeited_on_erasure')->sole();
        $this->assertEquals([12.4, true, $forfeit->id], [$audit->new_values['amount'], $audit->new_values['by_the_member'], $audit->new_values['line_id']]);
        $this->assertSame([(int) $member->organization_id, $member->id, $user->id], [(int) $audit->organization_id, (int) $audit->subject_id, (int) $audit->causer_id]);

        // The deletion itself is as it always was: anonymised, switched off, a fresh QR token (NOT NULL on PostgreSQL).
        $member = LoyaltyMember::withoutGlobalScopes()->with('user')->findOrFail($member->id);
        $this->assertFalse((bool) $member->is_active);
        $this->assertStringStartsWith('erased-', (string) $member->qr_code_token);
        $this->assertSame('Deleted Member', $member->user->name);
        $this->assertTrue(MemberErasure::isSelfDeleted($member));
    }

    public function test_a_self_deleted_member_earns_nothing_afterwards_and_their_credit_cannot_be_used(): void
    {
        ['org' => $org, 'member' => $member, 'token' => $token] = $this->memberWithCredit(100.0);
        $this->deleteOwnAccount($token);
        $member = LoyaltyMember::withoutGlobalScopes()->with('user')->findOrFail($member->id);
        $ledger = app(CreditLedger::class);

        // A booking of theirs completed later (a status change, the nightly sweep) earns no cashback.
        $this->assertNull($ledger->earnCashback($member, new Visit(Visit::APPOINTMENT, 'service_booking', 5000, 300.0, PortalBootstrap::venueToday($org->id)->toDateString())));

        $staff = User::create(['organization_id' => $org->id, 'name' => 'Desk', 'email' => uniqid('', false) . '-desk@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'staff']);
        foreach ([fn () => $ledger->spend($member, 1.0, $staff, null, 'k-1'), fn () => $ledger->adjust($member, 5.0, 'Back', $staff, 'k-2')] as $write) {
            try {
                $write();
                $this->fail('A deleted member\'s credit was written.');
            } catch (LoyaltyRefused $e) {
                $this->assertSame('already_erased', $e->errorCode);
            }
        }
        $this->assertSame(2, CreditTransaction::withoutGlobalScopes()->where('member_id', $member->id)->count());
        $this->assertSame(0, CreditLedger::cents(LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->value('credit_balance')));
    }

    public function test_a_member_without_credit_deletes_their_account_and_no_line_is_written(): void
    {
        ['member' => $member, 'token' => $token] = $this->memberWithCredit(0.0);

        $this->deleteOwnAccount($token);

        $this->assertSame(0, CreditTransaction::withoutGlobalScopes()->where('member_id', $member->id)->count());
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'credit.forfeited_on_erasure')->count());
        $this->assertFalse((bool) LoyaltyMember::withoutGlobalScopes()->findOrFail($member->id)->is_active);
    }
}
