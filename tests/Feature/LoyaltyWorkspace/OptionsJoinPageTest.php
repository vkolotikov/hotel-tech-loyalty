<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Services\Loyalty\Programme\ProgrammeOptions;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * The public join page promises the welcome bonus sign-up awards (release 7, spec 2026-10-25 §1): read through
 * ProgrammeOptions, so a venue that never set it reads 500 — what sign-up and staff enrolment give — where it read 0.
 */
class OptionsJoinPageTest extends MemberEndpointTestCase
{
    public function test_the_join_page_shows_the_welcome_bonus_sign_up_awards(): void
    {
        $org = $this->tenant('Numa Skin Lab');
        $url = '/api/v1/public/join/' . $org->fresh()->widget_token;

        $this->getJson($url)->assertOk()->assertJsonPath('welcome_bonus', 500);

        ProgrammeOptions::save($org->id, ['welcome_bonus_points' => 120], null);
        $this->getJson($url)->assertOk()->assertJsonPath('welcome_bonus', 120);

        ProgrammeOptions::save($org->id, ['welcome_bonus_points' => 0], null);
        $this->getJson($url)->assertOk()->assertJsonPath('welcome_bonus', 0);
    }
}
