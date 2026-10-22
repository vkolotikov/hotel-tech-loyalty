<?php

namespace Tests\Feature\Console;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Services\Booking\PayAtVenueFallback;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * `php artisan portal:pay-at-venue <organisation id> --on|--off|--status` (release 6, spec 2026-10-23 §2 item 4): the
 * member portal's pay-at-venue fallback, read and switched for one organisation through BookingRules — the setting the
 * Appointments workspace's Setup writes — also with the workspace off, each change audited.
 */
class PortalPayAtVenueTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    /** The setting as the portal reads it, for an organisation. */
    private function enabledFor(int $orgId): bool
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        HotelSetting::flushCacheFor($orgId);
        try {
            return PayAtVenueFallback::enabled();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }

    private function changes(): \Illuminate\Support\Collection
    {
        return AuditLog::withoutGlobalScopes()->where('action', 'booking.pay_at_venue_changed')->orderBy('id')->get();
    }

    public function test_status_on_and_off_write_the_setting_through_booking_rules_and_audit_each_change(): void
    {
        $org = $this->org->id;
        $this->artisan("portal:pay-at-venue {$org} --status")->expectsOutputToContain("org {$org} (Lumière Salon): pay at the venue when online payment is unavailable: off")->assertExitCode(0);
        $this->artisan("portal:pay-at-venue {$org}")->expectsOutputToContain('unavailable: off')->assertExitCode(0);
        $this->assertCount(0, $this->changes());

        $this->artisan("portal:pay-at-venue {$org} --on")->expectsOutputToContain('unavailable: ON')->assertExitCode(0);
        $this->assertTrue($this->enabledFor($org));
        $row = HotelSetting::withoutGlobalScopes()->where('organization_id', $org)->where('key', PayAtVenueFallback::SETTING)->firstOrFail();
        $this->assertSame(['true', 'boolean', 'booking'], [$row->getRawOriginal('value'), $row->type, $row->group]);

        // Again: nothing changes, nothing is audited.
        $this->artisan("portal:pay-at-venue {$org} --on")->expectsOutputToContain('unavailable: ON (it already was; nothing changed)')->assertExitCode(0);
        $this->artisan("portal:pay-at-venue {$org} --off")->expectsOutputToContain('unavailable: off')->assertExitCode(0);
        $this->assertFalse($this->enabledFor($org));

        $changes = $this->changes();
        $this->assertCount(2, $changes);
        $this->assertSame([['pay_at_venue_when_unavailable' => true], ['pay_at_venue_when_unavailable' => false]], [$changes[0]->new_values, $changes[0]->old_values]);
        $this->assertSame([['pay_at_venue_when_unavailable' => false], ['pay_at_venue_when_unavailable' => true]], [$changes[1]->new_values, $changes[1]->old_values]);
        foreach ($changes as $change) {
            $this->assertSame([$org, $org, null], [(int) $change->organization_id, (int) $change->subject_id, $change->causer_id]);
        }
    }

    public function test_it_works_with_the_appointments_workspace_off_and_touches_no_other_organisation(): void
    {
        $other = $this->otherOrganization();
        $this->org->setWorkspace('appointments', false);
        $this->assertFalse($this->org->fresh()->workspaceEnabled('appointments'));

        $this->artisan("portal:pay-at-venue {$this->org->id} --on")->assertExitCode(0);

        $this->assertTrue($this->enabledFor($this->org->id));
        $this->assertFalse($this->enabledFor($other['org']->id));
        // The bound organisation is put back as it was.
        $this->assertSame((int) $this->org->id, (int) app('current_organization_id'));
    }

    public function test_an_unknown_organisation_or_two_choices_are_refused_and_the_help_says_what_it_is(): void
    {
        $this->artisan('portal:pay-at-venue 999999999 --on')->expectsOutputToContain('Name an existing organisation')->assertExitCode(1);
        $this->artisan('portal:pay-at-venue abc --status')->assertExitCode(1);
        $this->artisan("portal:pay-at-venue {$this->org->id} --on --off")->expectsOutputToContain('Choose one of --on, --off and --status.')->assertExitCode(1);
        $this->assertFalse($this->enabledFor($this->org->id));
        $this->assertCount(0, $this->changes());

        Artisan::call('help', ['command_name' => 'portal:pay-at-venue']);
        $help = Artisan::output();
        $this->assertStringContainsString('php artisan workspace:appointments <organisation id> --off', $help);
        $this->assertStringContainsString('php artisan portal:pay-at-venue <organisation id> --on', $help);
        $this->assertStringContainsString('booking.pay_at_venue_changed', $help);
    }
}
