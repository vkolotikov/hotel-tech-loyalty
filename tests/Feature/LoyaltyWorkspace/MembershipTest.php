<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Mail\WelcomeMemberMail;
use App\Models\AuditLog;
use App\Models\EmailVerificationCode;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\User;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\QrCodeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A member's account in the workspace (spec 2026-10-21 release 2 §4.1, §4.2): Add member, Edit details, Change tier,
 * Deactivate / Reactivate, Delete, the card and the welcome email — who may, what each writes, every refusal, and
 * another organisation's member never reached.
 */
class MembershipTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        Mail::fake();
    }

    // ─── Add member ───────────────────────────────────────────────────────

    public function test_any_staff_member_adds_a_member_on_the_default_tier_with_the_bonus_and_the_welcome_email(): void
    {
        $response = $this->asStaffMember()->postJson($this->api('members'), ['name' => ' Alan Turing ', 'email' => 'alan@example.test', 'phone' => ' '])
            ->assertCreated()
            ->assertJsonPath('member.name', 'Alan Turing')
            ->assertJsonPath('member.email', 'alan@example.test')
            ->assertJsonPath('member.phone', null)
            ->assertJsonPath('member.tier_id', $this->tiers['silver']->id)
            ->assertJsonPath('member.points', 500)
            ->assertJsonPath('member.is_erased', false)
            ->assertJsonPath('email_sent', true);

        $member = LoyaltyMember::query()->findOrFail($response->json('member.id'));
        $this->assertSame($this->org->id, (int) $member->organization_id);
        $this->assertNotNull($member->welcomed_at);
        Mail::assertSent(WelcomeMemberMail::class, fn (WelcomeMemberMail $m) => $m->hasTo('alan@example.test'));
        $this->assertSame($this->staffMember->id, (int) AuditLog::where('action', 'member_created')->value('causer_id'));
    }

    public function test_adding_without_the_welcome_email_sends_nothing(): void
    {
        $this->asStaffMember()->postJson($this->api('members'), ['name' => 'Ken Thompson', 'email' => 'ken@example.test', 'send_welcome' => false])
            ->assertCreated()->assertJsonPath('email_sent', false);
        Mail::assertNothingSent();
    }

    public function test_adding_refuses_a_taken_email_wherever_it_is_and_the_plan_cap(): void
    {
        $other = $this->otherOrganization()['member'];

        $this->asStaffMember()->postJson($this->api('members'), ['name' => 'X', 'email' => $other->user->email])
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->asStaffMember()->postJson($this->api('members'), ['name' => '', 'email' => 'not-an-email'])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'email']);

        $this->org->forceFill(['plan_features' => ['max_loyalty_members' => '2']])->save();
        $this->asStaffMember()->postJson($this->api('members'), ['name' => 'Over', 'email' => 'over@example.test'])
            ->assertStatus(402)->assertJsonPath('error', 'member_limit');
        $this->assertSame(0, User::where('email', 'over@example.test')->count());
    }

    // ─── The member's page ────────────────────────────────────────────────

    public function test_the_members_page_carries_the_details_block_and_the_languages_offered(): void
    {
        $this->ada->user->forceFill(['language' => 'de', 'nationality' => 'British', 'date_of_birth' => '1815-12-10'])->save();
        $this->ada->update(['marketing_consent' => true, 'tier_override_until' => '2026-12-31 21:59:59']);

        $this->asStaffMember()->getJson($this->api("members/{$this->ada->id}"))->assertOk()
            ->assertJsonPath('member.language', 'de')
            ->assertJsonPath('member.nationality', 'British')
            ->assertJsonPath('member.date_of_birth', '1815-12-10')
            ->assertJsonPath('member.marketing_consent', true)
            ->assertJsonPath('member.tier_override_until', '2026-12-31T21:59:59+00:00')
            ->assertJsonPath('member.is_erased', false)
            ->assertJsonPath('member.qualifying_points', 1500)
            ->assertJsonPath('options.languages', ['en', 'ru', 'de', 'fr', 'es']);
    }

    // ─── Edit details ─────────────────────────────────────────────────────

    private function details(array $more = []): array
    {
        return $more + [
            'name' => 'Grace Hopper', 'email' => $this->grace->user->email, 'phone' => null, 'language' => null,
            'nationality' => null, 'date_of_birth' => null, 'marketing_consent' => false,
        ];
    }

    public function test_staff_edit_the_details_and_only_what_changed_is_written_and_audited(): void
    {
        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}"), $this->details([
            'name' => 'Grace B. Hopper', 'phone' => '+1 555 0100', 'language' => 'fr', 'date_of_birth' => '1906-12-09', 'marketing_consent' => true,
        ]))->assertOk()
            ->assertJsonPath('member.name', 'Grace B. Hopper')
            ->assertJsonPath('member.phone', '+1 555 0100')
            ->assertJsonPath('member.language', 'fr')
            ->assertJsonPath('member.date_of_birth', '1906-12-09')
            ->assertJsonPath('member.marketing_consent', true);

        $audit = AuditLog::where('action', 'member_updated')->firstOrFail();
        $this->assertSame(['marketing_consent', 'name', 'phone', 'language', 'date_of_birth'], array_keys($audit->new_values));

        // The same form again writes nothing.
        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}"), $this->details([
            'name' => 'Grace B. Hopper', 'phone' => '+1 555 0100', 'language' => 'fr', 'date_of_birth' => '1906-12-09', 'marketing_consent' => true,
        ]))->assertOk();
        $this->assertSame(1, AuditLog::where('action', 'member_updated')->count());
    }

    public function test_edit_details_checks_each_field(): void
    {
        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}"), $this->details([
            'name' => '', 'email' => $this->ada->user->email, 'phone' => str_repeat('1', 21), 'language' => 'xx', 'date_of_birth' => '2026-10-06', 'marketing_consent' => 'maybe',
        ]))->assertStatus(422)->assertJsonValidationErrors(['name', 'email', 'phone', 'date_of_birth', 'marketing_consent']);

        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}"), $this->details(['language' => 'xx']))
            ->assertStatus(422)->assertJsonValidationErrors('language');

        // A language set elsewhere stays allowed, so saving other fields does not lose it.
        $this->grace->user->forceFill(['language' => 'lv'])->save();
        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}"), $this->details(['language' => 'lv', 'nationality' => 'Latvian']))
            ->assertOk()->assertJsonPath('member.language', 'lv')->assertJsonPath('member.nationality', 'Latvian');
    }

    // ─── Change tier ──────────────────────────────────────────────────────

    public function test_a_manager_changes_the_tier_and_keeps_it_until_a_day_on_the_venues_clock(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();

        $this->asManager()->putJson($this->api("members/{$this->grace->id}/tier"), ['tier_id' => $this->tiers['platinum']->id, 'keep_until' => '2026-12-31'])
            ->assertOk()
            ->assertJsonPath('member.tier_id', $this->tiers['platinum']->id)
            ->assertJsonPath('member.tier_override_until', '2026-12-31T21:59:59+00:00');
        $this->assertSame('Tier override: Silver → Platinum', AuditLog::where('action', 'tier_override')->value('description'));

        // The review leaves the held tier alone while the day has not passed.
        app(\App\Services\LoyaltyService::class)->assessTier($this->grace->fresh());
        $this->assertSame($this->tiers['platinum']->id, (int) $this->grace->fresh()->tier_id);

        // Without a day the hold is cleared.
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/tier"), ['tier_id' => $this->tiers['platinum']->id])
            ->assertOk()->assertJsonPath('member.tier_override_until', null);
    }

    public function test_changing_the_tier_is_a_managers_and_takes_only_this_organisations_tiers(): void
    {
        $other = $this->otherOrganization();

        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}/tier"), ['tier_id' => $this->tiers['gold']->id])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/tier"), ['tier_id' => $other['tier']->id])
            ->assertStatus(422)->assertJsonValidationErrors('tier_id');
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/tier"), ['tier_id' => $this->tiers['gold']->id, 'keep_until' => '2026-10-05'])
            ->assertStatus(422)->assertJsonValidationErrors('keep_until');
        $this->assertSame($this->tiers['silver']->id, (int) $this->grace->fresh()->tier_id);
    }

    // ─── Deactivate / Reactivate ──────────────────────────────────────────

    public function test_a_manager_deactivates_and_reactivates_and_each_is_idempotent(): void
    {
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/deactivate"))->assertOk()->assertJsonPath('member.is_active', false);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/deactivate"))->assertOk()->assertJsonPath('member.is_active', false);
        $this->assertSame(1, AuditLog::where('action', 'member_deactivated')->count());

        $this->asManager()->postJson($this->api("members/{$this->grace->id}/reactivate"))->assertOk()->assertJsonPath('member.is_active', true);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/reactivate"))->assertOk();
        $this->assertSame(1, AuditLog::where('action', 'member_reactivated')->count());

        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/deactivate"))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/reactivate"))->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    // ─── Delete ───────────────────────────────────────────────────────────

    public function test_a_manager_deletes_a_member_by_typing_their_name_and_the_history_stays(): void
    {
        $user = $this->grace->user;
        $user->forceFill(['phone' => '+371 2000 0000', 'date_of_birth' => '1990-04-01', 'nationality' => 'LV'])->save();
        $user->createToken('mobile-app');
        NfcCard::create(['member_id' => $this->grace->id, 'uid' => '04:11:22', 'is_active' => true]);
        DB::table('points_transactions')->insert(['organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'points' => 200, 'type' => 'earn',
            'description' => 'Earn', 'balance_after' => 200, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->postJson($this->api("members/{$this->grace->id}/erase"), ['confirm_name' => 'Grace'])
            ->assertStatus(422)->assertJsonPath('error', 'name_mismatch');

        $this->asManager()->postJson($this->api("members/{$this->grace->id}/erase"), ['confirm_name' => '  grace HOPPER '])
            ->assertOk()
            ->assertJsonPath('member.name', 'Deleted Member')
            ->assertJsonPath('member.email', MemberErasure::stubEmail($this->grace->id))
            ->assertJsonPath('member.phone', null)
            ->assertJsonPath('member.date_of_birth', null)
            ->assertJsonPath('member.nationality', null)
            ->assertJsonPath('member.is_active', false)
            ->assertJsonPath('member.is_erased', true)
            ->assertJsonPath('member.member_number', $this->grace->member_number);

        $this->assertSame(0, DB::table('personal_access_tokens')->count());
        $this->assertSame(0, NfcCard::query()->where('member_id', $this->grace->id)->count());
        $this->asManager()->getJson($this->api("members/{$this->grace->id}/history"))->assertOk()->assertJsonPath('total', 1);
        $this->assertSame(1, AuditLog::where('action', 'member_deleted')->count());

        // Deleted once: everything that would bring the person back is refused.
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/erase"), ['confirm_name' => 'Deleted Member'])
            ->assertStatus(409)->assertJsonPath('error', 'already_erased');
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/reactivate"))->assertStatus(409)->assertJsonPath('error', 'already_erased');
        $this->asManager()->putJson($this->api("members/{$this->grace->id}"), $this->details(['name' => 'Back', 'email' => 'back@example.test']))
            ->assertStatus(409)->assertJsonPath('error', 'already_erased');
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/tier"), ['tier_id' => $this->tiers['gold']->id])->assertStatus(409);
        $this->asManager()->getJson($this->api("members/{$this->grace->id}/card"))->assertStatus(409);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/welcome"))->assertStatus(409);
        $this->assertSame(1, AuditLog::where('action', 'member_deleted')->count());
    }

    public function test_deleting_is_a_managers(): void
    {
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/erase"), ['confirm_name' => 'Grace Hopper'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->assertSame('Grace Hopper', $this->grace->user->fresh()->name);
    }

    // ─── The card ─────────────────────────────────────────────────────────

    public function test_the_card_is_an_svg_qr_of_the_member_number_that_the_workspaces_scan_reads(): void
    {
        $card = $this->asStaffMember()->getJson($this->api("members/{$this->ada->id}/card"))->assertOk()
            ->assertJsonPath('member_number', $this->ada->member_number)
            ->assertJsonPath('name', 'Ada Lovelace')
            ->json('qr_svg');

        $this->assertStringStartsWith('data:image/svg+xml;base64,', $card);
        $svg = base64_decode(substr($card, strlen('data:image/svg+xml;base64,')));
        $this->assertStringContainsString('<svg', $svg);
        $this->assertSame(app(QrCodeService::class)->generateStaticQrSvg($this->ada->member_number), $svg);

        // What that QR code holds (QrCodeService's static payload) finds the member at the desk.
        $payload = (new \ReflectionMethod(QrCodeService::class, 'staticQrPayload'))->invoke(app(QrCodeService::class), $this->ada->member_number);
        $this->asStaffMember()->postJson($this->api('scan'), ['code' => $payload])->assertOk()->assertJsonPath('member.id', $this->ada->id);
    }

    // ─── The welcome email again ──────────────────────────────────────────

    public function test_the_welcome_email_goes_again_once_in_ten_minutes(): void
    {
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/welcome"))->assertOk()->assertJsonPath('sent_to', $this->grace->user->email);
        Mail::assertSent(WelcomeMemberMail::class, 1);
        $this->assertSame(1, EmailVerificationCode::where('email', $this->grace->user->email)->count());

        $this->travel(4)->minutes();
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/welcome"))
            ->assertStatus(429)->assertJsonPath('error', 'too_soon')->assertJsonPath('retry_after', 360);
        Mail::assertSent(WelcomeMemberMail::class, 1);

        // Another member is not held back by this one.
        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/welcome"))->assertOk();

        $this->travel(7)->minutes();
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/welcome"))->assertOk();
    }

    public function test_a_failed_send_says_so_without_the_mail_servers_words_and_can_be_tried_again(): void
    {
        Mail::shouldReceive('to')->twice()->andThrow(new \RuntimeException('smtp password rejected for user x'));

        $response = $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/welcome"))
            ->assertStatus(502)->assertJsonPath('error', 'email_failed');
        $this->assertStringNotContainsString('smtp', $response->getContent());

        // The failed send did not use up the ten minutes: the next press tries again at once.
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/welcome"))->assertStatus(502)->assertJsonPath('error', 'email_failed');
    }

    public function test_a_member_without_an_email_has_no_welcome_email(): void
    {
        $this->grace->forceFill(['user_id' => null])->save();
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/welcome"))->assertStatus(422)->assertJsonPath('error', 'no_email');
    }

    // ─── Only this organisation ───────────────────────────────────────────

    public function test_another_organisations_member_is_not_found_on_every_route(): void
    {
        $other = $this->otherOrganization()['member'];
        $id = $other->id;

        $this->asManager()->putJson($this->api("members/{$id}"), $this->details(['email' => 'x@example.test']))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->putJson($this->api("members/{$id}/tier"), ['tier_id' => $this->tiers['gold']->id])->assertStatus(404);
        $this->asManager()->postJson($this->api("members/{$id}/deactivate"))->assertStatus(404);
        $this->asManager()->postJson($this->api("members/{$id}/reactivate"))->assertStatus(404);
        $this->asManager()->postJson($this->api("members/{$id}/erase"), ['confirm_name' => 'Someone Else'])->assertStatus(404);
        $this->asManager()->getJson($this->api("members/{$id}/card"))->assertStatus(404);
        $this->asManager()->postJson($this->api("members/{$id}/welcome"))->assertStatus(404);

        $fresh = LoyaltyMember::withoutGlobalScopes()->find($id);
        $this->assertTrue((bool) $fresh->is_active);
        $this->assertSame('Someone Else', User::find($fresh->user_id)->name);
        Mail::assertNothingSent();
    }
}
