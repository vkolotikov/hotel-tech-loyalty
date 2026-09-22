<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use Illuminate\Support\Facades\Schema;

/**
 * GET /v1/member/referral — the link a member shares with a friend.
 *
 * It used to be `app.url . '/join?ref=' . code`, and `/join` is not a route
 * anywhere: every referral ever shared landed the friend on the SPA
 * catch-all, i.e. the staff login screen. The real public sign-up page is
 * `/portal/join?org=<widget_token>` (PortalJoin.tsx, which now reads `ref`
 * and prefills the code), so that is what the link must be — and it must
 * be null, not a dead string, when either half is missing.
 */
class ReferralLinkTest extends MemberEndpointTestCase
{
    private const ENDPOINT = '/api/v1/member/referral';

    protected function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasTable('referrals')) {
            Schema::create('referrals', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('referrer_id');
                $t->unsignedBigInteger('referee_id');
                $t->string('status', 32)->default('pending');
                $t->integer('referrer_points_awarded')->default(0);
                $t->integer('referee_points_awarded')->default(0);
                $t->timestamp('qualified_at')->nullable();
                $t->timestamp('rewarded_at')->nullable();
                $t->timestamps();
            });
        }
    }

    public function test_the_link_is_the_public_join_page_with_the_org_token_and_the_code(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);

        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->update(['referral_code' => 'ABC123']);

        $response = $this->withToken($token)->getJson(self::ENDPOINT)->assertStatus(200);

        $expected = rtrim((string) config('app.url'), '/')
            . '/portal/join?org=' . urlencode((string) $org->fresh()->widget_token)
            . '&ref=ABC123';

        $this->assertSame($expected, $response->json('referral_link'));
        $this->assertSame('ABC123', $response->json('referral_code'));
        $this->assertStringNotContainsString('/join?ref=', (string) $response->json('referral_link'));
    }

    public function test_no_org_token_means_no_link_rather_than_a_dead_one(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);

        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->update(['referral_code' => 'ABC123']);
        Organization::withoutGlobalScopes()->whereKey($org->id)->update(['widget_token' => null]);

        $this->withToken($token)->getJson(self::ENDPOINT)
            ->assertStatus(200)
            ->assertJson(['referral_link' => null, 'referral_code' => 'ABC123']);
    }

    public function test_no_referral_code_means_no_link(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);

        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->update(['referral_code' => null]);

        $this->withToken($token)->getJson(self::ENDPOINT)
            ->assertStatus(200)
            ->assertJson(['referral_link' => null]);
    }
}
