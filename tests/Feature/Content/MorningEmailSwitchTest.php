<?php

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The morning email switch (spec 2026-10-19 §4.5): each person's own, off by default, in Content and in the full admin. */
class MorningEmailSwitchTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_it_is_off_by_default_and_each_person_switches_their_own(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.morning_email', false);

        $this->asStaffMember()->putJson($this->api('me/morning-email'), ['on' => true])->assertOk()->assertJsonPath('on', true);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', true);
        $this->asManager()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', false);

        $this->asStaffMember()->putJson($this->api('me/morning-email'), ['on' => 'often'])->assertStatus(422)->assertJsonValidationErrors('on');
        $this->asStaffMember()->putJson($this->api('me/morning-email'), [])->assertStatus(422)->assertJsonValidationErrors('on');
        $this->asStaffMember()->putJson($this->api('me/morning-email'), ['on' => false])->assertOk()->assertJsonPath('on', false);
        $this->assertFalse($this->staffMember->fresh()->wants_content_morning_email);
    }

    public function test_the_full_admins_preferences_carry_it_too(): void
    {
        $this->asStaffMember()->putJson('/api/v1/admin/me/preferences', ['wants_content_morning_email' => true])->assertOk()
            ->assertJsonPath('wants_content_morning_email', true);
        $this->asStaffMember()->getJson('/api/v1/admin/me/preferences')->assertOk()
            ->assertJsonPath('wants_content_morning_email', true)
            ->assertJsonPath('content_morning_email_last_sent_at', null);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.morning_email', true);
    }

    // Plan 5A-2: the portal knows the person's own posts by this id (Mark published for the poster, spec 2026-10-19 §4.4).
    public function test_the_bootstrap_names_the_person_by_id(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.id', $this->staffMember->id);
        $this->asManager()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('staff.id', $this->manager->id);
    }
}
