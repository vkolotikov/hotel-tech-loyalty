<?php

namespace Tests\Feature\Notifications;

use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\EmailComplianceService;
use Illuminate\Support\Str;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\Message;
use Symfony\Component\Mime\Email;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The rules that stop the first campaign being a compliance incident.
 *
 * Before this there was no unsubscribe token, route, footer or
 * `List-Unsubscribe` header anywhere in the codebase, and all three bulk
 * paths gated on `email_notifications` — which defaults to TRUE — rather
 * than `marketing_consent`, which defaults to FALSE. Marketing therefore
 * reached every member regardless of whether they had ever agreed.
 */
class EmailComplianceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private EmailComplianceService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->svc = app(EmailComplianceService::class);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /**
     * A member WITH a linked user row — the factory doesn't create one, and
     * `canReceive()` correctly refuses a member it has no address for.
     */
    private function member(array $state = []): LoyaltyMember
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        $tier = LoyaltyTierFactory::new()->bronze()->create();

        $user = User::create([
            'name'            => 'Test Member',
            'email'           => 'member' . Str::random(8) . '@example.com',
            'password'        => 'x',
            'user_type'       => 'member',
            'language'        => 'en',
            'organization_id' => $org->id,
        ]);

        return LoyaltyMemberFactory::new()
            ->inTier($tier->id)
            ->create($state + ['user_id' => $user->id])
            ->refresh();
    }

    public function test_marketing_requires_explicit_consent(): void
    {
        // The default position: email_notifications true, consent false.
        $member = $this->member(['marketing_consent' => false, 'email_notifications' => true]);

        $this->assertFalse(
            $this->svc->canReceive($member, 'marketing'),
            'the channel switch alone must not authorise marketing'
        );
    }

    public function test_transactional_does_not_require_consent(): void
    {
        $member = $this->member(['marketing_consent' => false, 'email_notifications' => false]);

        $this->assertTrue(
            $this->svc->canReceive($member, EmailComplianceService::TRANSACTIONAL),
            'a member who opted out of marketing has not opted out of password resets'
        );
    }

    public function test_consent_plus_channel_allows_marketing(): void
    {
        $member = $this->member(['marketing_consent' => true, 'email_notifications' => true]);

        $this->assertTrue($this->svc->canReceive($member, 'marketing'));
    }

    public function test_unsubscribing_blocks_marketing_but_not_service_mail(): void
    {
        $member = $this->member(['marketing_consent' => true, 'email_notifications' => true]);
        $member->forceFill(['email_notifications' => false, 'unsubscribed_at' => now()])->save();

        $member->refresh();
        $this->assertFalse($this->svc->canReceive($member, 'marketing'));
        $this->assertTrue($this->svc->canReceive($member, EmailComplianceService::TRANSACTIONAL));
    }

    public function test_member_without_an_email_receives_nothing(): void
    {
        $member = $this->member(['marketing_consent' => true, 'email_notifications' => true]);
        $member->user->update(['email' => '']);

        $this->assertFalse($this->svc->canReceive($member->refresh(), EmailComplianceService::TRANSACTIONAL));
    }

    public function test_unsubscribe_token_is_generated_once_and_reused(): void
    {
        $member = $this->member();

        $first = $this->svc->unsubscribeUrl($member);
        $second = $this->svc->unsubscribeUrl($member->fresh());

        $this->assertSame($first, $second, 'a link in an already-delivered email must keep working');
        $this->assertNotEmpty($member->fresh()->unsubscribe_token);
        $this->assertSame(48, strlen($member->fresh()->unsubscribe_token));
    }

    public function test_marketing_mail_carries_one_click_headers(): void
    {
        $member = $this->member(['marketing_consent' => true, 'email_notifications' => true]);

        // Build the Message directly rather than going through Mail::fake(),
        // which never runs the closure — the headers are what we're testing.
        $message = new Message(new Email());
        $this->svc->applyHeaders($message, $member, 'marketing');

        $headers = $message->getHeaders();
        $this->assertSame(
            '<' . $this->svc->unsubscribeUrl($member) . '>',
            $headers->get('List-Unsubscribe')?->getBodyAsString()
        );
        // RFC 8058 — without this the header is decorative and Gmail
        // won't render its own unsubscribe button.
        $this->assertSame(
            'List-Unsubscribe=One-Click',
            $headers->get('List-Unsubscribe-Post')?->getBodyAsString()
        );
    }

    public function test_transactional_mail_carries_no_unsubscribe_headers(): void
    {
        $member = $this->member();

        $message = new Message(new Email());
        $this->svc->applyHeaders($message, $member, EmailComplianceService::TRANSACTIONAL);

        $this->assertNull($message->getHeaders()->get('List-Unsubscribe'));
    }

    public function test_footers_carry_the_unsubscribe_link(): void
    {
        $member = $this->member();
        $url = $this->svc->unsubscribeUrl($member);

        $this->assertStringContainsString($url, $this->svc->footerHtml($member, 'Demo Hotel'));
        $this->assertStringContainsString($url, $this->svc->footerText($member, 'Demo Hotel'));
        $this->assertStringContainsString('Demo Hotel', $this->svc->footerHtml($member, 'Demo Hotel'));
    }

    public function test_scope_eligible_excludes_the_unconsented(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        $tier = LoyaltyTierFactory::new()->bronze()->create();

        LoyaltyMemberFactory::new()->inTier($tier->id)->create(['marketing_consent' => true,  'email_notifications' => true]);
        LoyaltyMemberFactory::new()->inTier($tier->id)->create(['marketing_consent' => false, 'email_notifications' => true]);
        LoyaltyMemberFactory::new()->inTier($tier->id)->create(['marketing_consent' => true,  'email_notifications' => false]);

        $marketing = $this->svc->scopeEligible(LoyaltyMember::query(), 'marketing')->count();
        $transactional = $this->svc->scopeEligible(LoyaltyMember::query(), EmailComplianceService::TRANSACTIONAL)->count();

        $this->assertSame(1, $marketing, 'only the fully-consented member may receive marketing');
        $this->assertSame(3, $transactional, 'service mail reaches everyone');
    }
}
