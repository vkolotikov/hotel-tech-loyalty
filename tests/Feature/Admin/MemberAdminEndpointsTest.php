<?php

namespace Tests\Feature\Admin;

use App\Mail\WelcomeMemberMail;
use App\Models\AuditLog;
use App\Models\EmailVerificationCode;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\NfcCard;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's member endpoints whose logic moved into the shared services of HexaTech Loyalty release 2 (§4.3):
 * store, resend-welcome, update, deactivate and destroy now call MemberEnrolment, MemberDetails, MemberStatus and
 * MemberErasure. Written against the controller as it was and kept passing on the new code: the same answers, the
 * same rows, the same audit. One owner decision changes an answer on purpose: deleting a member now also clears the
 * date of birth (R2-4).
 */
class MemberAdminEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        Mail::fake();
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/' . ltrim($path, '/');
    }

    // ─── store ────────────────────────────────────────────────────────────

    public function test_store_enrols_on_the_lowest_tier_with_the_welcome_bonus_and_sends_the_welcome_email(): void
    {
        $response = $this->asManager()->postJson($this->admin('members'), ['name' => 'Alan Turing', 'email' => 'alan@example.test', 'phone' => '+44 20 1234'])
            ->assertCreated()
            ->assertJsonPath('message', 'Member created. Welcome email sent — user will set their own password.')
            ->assertJsonPath('invite_flow', true)
            ->assertJsonPath('email_sent', true)
            ->assertJsonPath('member.user.name', 'Alan Turing')
            ->assertJsonPath('member.user.email', 'alan@example.test')
            ->assertJsonPath('member.tier.name', 'Silver')
            ->assertJsonPath('member.is_active', true);

        $member = LoyaltyMember::query()->findOrFail($response->json('member.id'));
        $this->assertMatchesRegularExpression('/^HL-2026-\d{6}$/', $member->member_number);
        $this->assertSame(500, (int) $member->current_points);
        $this->assertSame(500, (int) $member->lifetime_points);
        $this->assertNotNull($member->welcomed_at);
        $this->assertNotNull($member->referral_code);
        $this->assertSame('member', $member->user->user_type);
        $this->assertSame($this->org->id, (int) $member->user->organization_id);
        $this->assertSame('+44 20 1234', $member->user->phone);
        $this->assertSame(1, DB::table('points_transactions')->where('member_id', $member->id)->where('type', 'bonus')->count());
        $this->assertSame(1, EmailVerificationCode::where('email', 'alan@example.test')->whereNull('verified_at')->count());
        Mail::assertSent(WelcomeMemberMail::class, fn (WelcomeMemberMail $mail) => $mail->hasTo('alan@example.test'));
        $this->assertSame(1, AuditLog::where('action', 'member_created')->where('subject_id', $member->id)->count());
    }

    public function test_store_with_a_password_skips_the_invite_and_links_the_chosen_card(): void
    {
        $response = $this->asManager()->postJson($this->admin('members'), [
            'name' => 'Edsger Dijkstra', 'email' => 'edsger@example.test', 'password' => 'long-enough-1', 'nfc_uid' => '04:AB:CD:EF',
        ])->assertCreated()
            ->assertJsonPath('message', 'Member created successfully')
            ->assertJsonPath('invite_flow', false)
            ->assertJsonPath('email_sent', false);

        $member = LoyaltyMember::query()->findOrFail($response->json('member.id'));
        // Release 6: the card is linked through NfcCards (its ID stored normalised); the member keeps their own QR code.
        $this->assertNotSame('04:AB:CD:EF', $member->qr_code_token);
        $this->assertSame(1, NfcCard::query()->where('member_id', $member->id)->where('uid', '04abcdef')->count());
        $this->assertSame(0, EmailVerificationCode::where('email', 'edsger@example.test')->count());
        Mail::assertNothingSent();
    }

    public function test_store_with_a_card_another_member_has_creates_nobody_and_says_so_on_the_card_field(): void
    {
        NfcCard::create(['member_id' => $this->grace->id, 'uid' => '04abcdef', 'is_active' => true]);

        $this->asManager()->postJson($this->admin('members'), [
            'name' => 'Edsger Dijkstra', 'email' => 'edsger@example.test', 'password' => 'long-enough-1', 'nfc_uid' => '04:AB:CD:EF',
        ])->assertStatus(422)->assertJsonValidationErrors('nfc_uid');

        $this->assertSame(0, \App\Models\User::query()->where('email', 'edsger@example.test')->count(), 'the enrolment rolled back');
    }

    public function test_store_without_sending_keeps_the_invite_code_and_says_the_email_failed(): void
    {
        $this->asManager()->postJson($this->admin('members'), ['name' => 'Ken Thompson', 'email' => 'ken@example.test', 'send_welcome_email' => false])
            ->assertCreated()
            ->assertJsonPath('email_sent', false)
            ->assertJsonPath('message', 'Member created, but the welcome email failed to send. You may need to share credentials manually.');
        $this->assertSame(1, EmailVerificationCode::where('email', 'ken@example.test')->count());
        Mail::assertNothingSent();
    }

    public function test_store_refuses_a_taken_email_the_plan_cap_and_a_programme_without_tiers(): void
    {
        $this->asManager()->postJson($this->admin('members'), ['name' => 'Ada Again', 'email' => $this->ada->user->email])
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $this->org->forceFill(['plan_features' => ['max_loyalty_members' => '2']])->save();
        $this->asManager()->postJson($this->admin('members'), ['name' => 'Over Cap', 'email' => 'cap@example.test'])
            ->assertStatus(402)
            ->assertJsonPath('reason', 'plan_limit')
            ->assertJsonPath('error', 'Your plan allows up to 2 loyalty members. Upgrade your plan to add more, or remove an existing one first.');

        $this->org->forceFill(['plan_features' => []])->save();
        // A programme without tiers has no members either (a member's tier is a NOT NULL foreign key in production).
        LoyaltyMember::query()->delete();
        LoyaltyTier::query()->delete();
        $this->asManager()->postJson($this->admin('members'), ['name' => 'No Tier', 'email' => 'notier@example.test'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'No loyalty tiers configured for this organization. Create at least one tier (e.g. Bronze) before enrolling members.');
        $this->assertSame(0, User::where('email', 'cap@example.test')->orWhere('email', 'notier@example.test')->count());
    }

    // ─── resend-welcome ───────────────────────────────────────────────────

    public function test_resend_replaces_the_open_code_and_sends_again(): void
    {
        $email = $this->grace->user->email;
        EmailVerificationCode::create(['email' => $email, 'code' => '111111', 'expires_at' => now()->addHour()]);

        $this->asManager()->postJson($this->admin("members/{$this->grace->id}/resend-welcome"))
            ->assertOk()->assertExactJson(['message' => 'Welcome email sent to ' . $email]);

        $codes = EmailVerificationCode::where('email', $email)->get();
        $this->assertCount(1, $codes);
        $this->assertNotSame('111111', $codes->first()->code);
        $this->assertTrue($codes->first()->expires_at->equalTo(now()->addHours(48)));
        Mail::assertSent(WelcomeMemberMail::class, fn (WelcomeMemberMail $mail) => $mail->hasTo($email));
    }

    public function test_resend_says_why_it_could_not(): void
    {
        // A member's user is NOT NULL in production; what the venue can lack is an address on that user.
        $this->grace->user->forceFill(['email' => ''])->save();
        $this->asManager()->postJson($this->admin("members/{$this->grace->id}/resend-welcome"))
            ->assertStatus(422)->assertExactJson(['message' => 'Member has no email on file']);

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));
        $this->asManager()->postJson($this->admin("members/{$this->ada->id}/resend-welcome"))
            ->assertStatus(500)->assertExactJson(['message' => 'Could not send email: smtp is down']);
    }

    // ─── update ───────────────────────────────────────────────────────────

    public function test_update_changes_the_details_and_audits_them(): void
    {
        $this->asManager()->putJson($this->admin("members/{$this->grace->id}"), [
            'name' => 'Grace B. Hopper', 'phone' => null, 'nationality' => 'US', 'language' => 'en', 'date_of_birth' => '1906-12-09', 'marketing_consent' => true,
        ])->assertOk()
            ->assertJsonPath('message', 'Member updated')
            ->assertJsonPath('member.user.name', 'Grace B. Hopper')
            ->assertJsonPath('member.user.nationality', 'US')
            ->assertJsonPath('member.marketing_consent', true)
            ->assertJsonPath('member.tier.name', 'Silver');

        $user = $this->grace->user->fresh();
        $this->assertSame('1906-12-09', $user->date_of_birth->toDateString());
        $this->assertNull($user->phone);
        $audit = AuditLog::where('action', 'member_updated')->where('subject_id', $this->grace->id)->firstOrFail();
        $this->assertSame('Grace B. Hopper', $audit->new_values['name']);
        $this->assertSame('Grace Hopper', $audit->old_values['name']);
        $this->assertSame(0, AuditLog::where('action', 'tier_override')->count());
    }

    public function test_a_tier_change_resets_the_tier_dates_and_is_audited_as_an_override(): void
    {
        $this->asManager()->putJson($this->admin("members/{$this->grace->id}"), ['tier_id' => $this->tiers['platinum']->id, 'tier_override_until' => '2027-01-31T00:00:00Z'])
            ->assertOk()->assertJsonPath('member.tier.name', 'Platinum');

        $grace = $this->grace->fresh();
        $this->assertSame('2026-10-05', $grace->tier_effective_from->toDateString());
        $this->assertSame('2027-10-05', $grace->tier_effective_until->toDateString());
        $this->assertSame('2027-10-05', $grace->tier_review_date->toDateString());
        $this->assertSame('2027-01-31', $grace->tier_override_until->toDateString());
        $audit = AuditLog::where('action', 'tier_override')->firstOrFail();
        $this->assertSame('Tier override: Silver → Platinum', $audit->description);
    }

    public function test_update_refuses_another_organisations_tier(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->putJson($this->admin("members/{$this->grace->id}"), ['tier_id' => $other['tier']->id])
            ->assertStatus(422)->assertExactJson(['message' => 'Invalid tier for this organization.']);
        $this->assertSame($this->tiers['silver']->id, (int) $this->grace->fresh()->tier_id);
    }

    // ─── deactivate (a toggle) ────────────────────────────────────────────

    public function test_deactivate_toggles_and_audits_each_way(): void
    {
        $this->asManager()->patchJson($this->admin("members/{$this->grace->id}/deactivate"))->assertOk()->assertExactJson(['success' => true, 'is_active' => false]);
        $this->assertFalse($this->grace->fresh()->is_active);
        $this->asManager()->patchJson($this->admin("members/{$this->grace->id}/deactivate"))->assertOk()->assertExactJson(['success' => true, 'is_active' => true]);

        $this->assertSame(['member_deactivated', 'member_reactivated'], AuditLog::whereIn('action', ['member_deactivated', 'member_reactivated'])->orderBy('id')->pluck('action')->all());
        $this->assertSame("Member #{$this->grace->member_number} deactivated", AuditLog::where('action', 'member_deactivated')->value('description'));
    }

    // ─── destroy (anonymise) ──────────────────────────────────────────────

    public function test_destroy_anonymises_and_keeps_the_number_and_the_history(): void
    {
        $user = $this->grace->user;
        $user->forceFill(['phone' => '+371 2000 0000', 'nationality' => 'LV', 'avatar_url' => 'https://cdn.example.test/a.png', 'date_of_birth' => '1990-04-01'])->save();
        $user->createToken('mobile-app');
        NfcCard::create(['member_id' => $this->grace->id, 'uid' => '04:11:22', 'is_active' => true]);
        $this->grace->update(['expo_push_token' => 'ExponentPushToken[x]', 'qr_code_token' => 'abc', 'referral_code' => 'GRACE1']);
        DB::table('points_transactions')->insert(['organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'points' => 200, 'type' => 'earn', 'balance_after' => 200, 'description' => 'Earned', 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->deleteJson($this->admin("members/{$this->grace->id}"))->assertOk()->assertExactJson(['success' => true, 'message' => 'Member deleted']);

        $grace = $this->grace->fresh();
        $user = $user->fresh();
        $this->assertFalse($grace->is_active);
        // The old QR code no longer names her; the column is NOT NULL and unique in production, so a fresh value replaces it.
        $this->assertNotSame('abc', $grace->qr_code_token);
        $this->assertStringStartsWith('erased-', (string) $grace->qr_code_token);
        $this->assertNull($grace->expo_push_token);
        $this->assertSame('GRACE1', $grace->referral_code);
        $this->assertSame('LS-' . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT), $grace->member_number);
        $this->assertSame('Deleted Member', $user->name);
        $this->assertSame("deleted-member-{$grace->id}@deleted.local", $user->email);
        $this->assertNull($user->phone);
        $this->assertNull($user->nationality);
        $this->assertNull($user->avatar_url);
        // R2-4: the date of birth goes too (the full admin kept it before release 2).
        $this->assertNull($user->date_of_birth);
        $this->assertSame(0, DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->count());
        $this->assertSame(0, NfcCard::query()->where('member_id', $grace->id)->count());
        $this->assertSame(1, DB::table('points_transactions')->where('member_id', $grace->id)->count());

        $audit = AuditLog::where('action', 'member_deleted')->firstOrFail();
        $this->assertSame(['member_number' => $grace->member_number, 'email' => $this->grace->user->email, 'name' => 'Grace Hopper'], $audit->old_values);
        $this->assertSame("Member #{$grace->member_number} ({$this->grace->user->email}) anonymised", $audit->description);
    }

    public function test_another_organisations_member_is_not_found_on_every_endpoint(): void
    {
        $other = $this->otherOrganization()['member'];

        $this->asManager()->putJson($this->admin("members/{$other->id}"), ['name' => 'X'])->assertNotFound();
        $this->asManager()->patchJson($this->admin("members/{$other->id}/deactivate"))->assertNotFound();
        $this->asManager()->deleteJson($this->admin("members/{$other->id}"))->assertNotFound();
        $this->asManager()->postJson($this->admin("members/{$other->id}/resend-welcome"))->assertNotFound();
        $this->assertTrue((bool) LoyaltyMember::withoutGlobalScopes()->find($other->id)->is_active);
    }
}
