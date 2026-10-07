<?php

namespace Tests\Feature\Member;

/**
 * The behaviour behind NestedThrottleBucketsTest, end to end through the real
 * middleware stack: an ordinary signed-in session must not use up a route's
 * own, stricter limit.
 *
 * The portal's cancel route allows 20 a minute. Before each inner limiter got
 * its own bucket it read the signed-in group's counter, so 20 page loads
 * anywhere in the portal were enough to refuse the cancel — the same way the
 * admin's polling refused every industry switch.
 */
class InnerThrottleBucketTest extends MemberEndpointTestCase
{
    public function test_ordinary_requests_do_not_spend_a_routes_own_limit(): void
    {
        ['token' => $token] = $this->member($this->tenant());

        for ($i = 0; $i < 25; $i++) {
            $this->withToken($token)->getJson('/api/v1/member/profile');
        }

        $status = $this->withToken($token)
            ->postJson('/api/v1/member/portal/bookings/service/999999/cancel')
            ->status();

        $this->assertNotSame(429, $status,
            'The cancel route was refused after 25 unrelated requests: its limiter is reading the session\'s counter.');
    }
}
