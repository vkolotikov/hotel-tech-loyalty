<?php

namespace Tests\Feature\Mail;

use App\Mail\BookingMembershipMail;
use App\Mail\WelcomeMemberMail;
use App\Models\Organization;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Both activation emails told a member to tap "Forgot password" on a login
 * screen; the flow they describe is /portal/claim. The link has to be in
 * the email, or the member is left guessing which app to install.
 */
class MemberPortalLinksInMailTest extends MemberEndpointTestCase
{
    public function test_the_welcome_email_links_to_the_claim_page(): void
    {
        config(['app.url' => 'https://app.example.test']);
        $org = $this->tenant();
        ['member' => $member] = $this->member($org);
        $member->load(['user', 'tier']);

        $html = (new WelcomeMemberMail($member, $org, '123456'))->render();

        $this->assertStringContainsString('https://app.example.test/portal/claim', $html);
        $this->assertStringNotContainsString('Forgot password', $html);
        $this->assertStringContainsString('123456', $html);
    }

    /**
     * The Claim page's email step has no way to reach the code step without
     * calling send-code, which mails a second code — so the email must not
     * tell a member to "ask for a code" (that mints a duplicate). It sends
     * them to the "I already have a code" action instead, which keeps the
     * emailed code (valid 48 hours) usable on its own.
     */
    public function test_the_welcome_email_points_at_the_already_have_a_code_action(): void
    {
        config(['app.url' => 'https://app.example.test']);
        $org = $this->tenant();
        ['member' => $member] = $this->member($org);
        $member->load(['user', 'tier']);

        $html = (new WelcomeMemberMail($member, $org, '123456'))->render();

        $this->assertStringContainsString("choose 'I already have a code'", $html);
        $this->assertStringNotContainsString('ask for a code', $html);
    }

    public function test_the_booking_membership_email_links_to_the_claim_page(): void
    {
        config(['app.url' => 'https://app.example.test']);
        $org = Organization::create(['name' => 'Seaside', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $org->id);

        $html = (new BookingMembershipMail('Ada', 'Seaside', 'HL-1', 'Bronze', 'ada@example.test', '654321'))->render();

        $this->assertStringContainsString('https://app.example.test/portal/claim', $html);
        $this->assertStringNotContainsString('Forgot password', $html);
    }

    public function test_the_booking_membership_email_points_at_the_already_have_a_code_action(): void
    {
        config(['app.url' => 'https://app.example.test']);
        $org = Organization::create(['name' => 'Seaside', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $org->id);

        $html = (new BookingMembershipMail('Ada', 'Seaside', 'HL-1', 'Bronze', 'ada@example.test', '654321'))->render();

        $this->assertStringContainsString("choose 'I already have a code'", $html);
        $this->assertStringNotContainsString('ask for a code', $html);
    }

    /**
     * No configured app.url must never fall through to a wrong (localhost)
     * link — the fallback sentence naming the member portal takes over
     * instead. This proves that for the console context every test in this
     * suite actually runs in (app()->runningInConsole() is always true
     * under PHPUnit). The production-specific half of the rule — no
     * app.url AND production must be null even with a live request host —
     * is proven against PortalLinks::resolve() directly, with literal
     * booleans, by tests/Unit/Portal/PortalLinksTest.php; it cannot be
     * proven by switching environment() on a Feature test like this one,
     * because the console guard alone already forces null here regardless
     * of environment.
     */
    public function test_without_an_app_url_the_link_is_left_out_rather_than_wrong(): void
    {
        config(['app.url' => '']);
        $org = $this->tenant();
        ['member' => $member] = $this->member($org);
        $member->load(['user', 'tier']);

        $html = (new WelcomeMemberMail($member, $org, '123456'))->render();

        $this->assertStringNotContainsString('localhost', $html);
        $this->assertStringContainsString('member portal', $html);
    }
}
