<?php

namespace Tests\Feature\Appointments\Messages;

use App\Services\Appointments\Messages\MessageSettings;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MessageSettingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_everything_is_off_until_a_manager_switches_it_on(): void
    {
        $this->assertSame(['staff_default' => false, 'reminder_hours' => 0, 'language' => 'en'], MessageSettings::read($this->org->id));
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()
            ->assertJsonPath('messages', ['staff_default' => false, 'reminder_hours' => 0, 'language' => 'en']);
    }

    public function test_a_manager_saves_them_in_setup_and_other_staff_may_not(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), [
            'client_messages_staff_default'  => true,
            'client_messages_reminder_hours' => 24,
            'client_messages_language'       => 'ru',
        ])->assertOk()
            ->assertJsonPath('settings.client_messages_staff_default', true)
            ->assertJsonPath('settings.client_messages_reminder_hours', 24)
            ->assertJsonPath('settings.client_messages_language', 'ru');
        $this->assertSame(['staff_default' => true, 'reminder_hours' => 24, 'language' => 'ru'], MessageSettings::read($this->org->id));

        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['client_messages_staff_default' => false])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
    }

    public function test_only_the_offered_choices_are_accepted(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['client_messages_reminder_hours' => 12])->assertStatus(422);
        $this->asStaff()->patchJson($this->api('setup/settings'), ['client_messages_language' => 'lv'])->assertStatus(422);
        $this->asStaff()->patchJson($this->api('setup/settings'), ['client_messages_staff_default' => 'maybe'])->assertStatus(422);
    }

    public function test_a_stored_value_outside_the_choices_reads_as_the_default(): void
    {
        DB::table('hotel_settings')->insert([
            ['organization_id' => $this->org->id, 'key' => MessageSettings::REMINDER_HOURS, 'value' => '7', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $this->org->id, 'key' => MessageSettings::LANGUAGE, 'value' => 'xx', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->assertSame(['staff_default' => false, 'reminder_hours' => 0, 'language' => 'en'], MessageSettings::read($this->org->id));
    }

    public function test_the_checklist_offers_an_optional_step_until_something_is_on(): void
    {
        $step = fn () => collect(app(SetupChecklist::class)->for($this->org->id, null)['steps'])->firstWhere('key', 'messages');

        $this->assertSame(['key' => 'messages', 'done' => false, 'optional' => true], $step());
        $this->setClientMessages(false, 24);
        $this->assertTrue($step()['done']);
        $this->setClientMessages(true, 0);
        $this->assertTrue($step()['done']);
    }
}
