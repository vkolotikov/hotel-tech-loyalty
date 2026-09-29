<?php

namespace Tests\Feature\Member;

class RetiredEndpointsTest extends MemberEndpointTestCase
{
    /** Nothing calls it, and two write paths per booking kind invite drift. */
    public function test_the_old_member_reservation_endpoint_is_gone(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);

        $status = $this->withToken($token)->postJson('/api/v1/member/reservations', ['check_in' => now()->addDays(3)->toDateString(), 'check_out' => now()->addDays(5)->toDateString()])->status();

        $this->assertContains($status, [404, 405]);
        $this->assertFalse(class_exists(\App\Http\Controllers\Api\V1\Member\MemberReservationController::class));
    }
}
