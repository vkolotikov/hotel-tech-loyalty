<?php

namespace Tests\Feature\Appointments\Setup;

use App\Services\Appointments\Money\Deposits;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §4.1: the workspace Setup's "Deposits for online bookings", written to the full admin's own settings. */
class SetupDepositsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_setup_shows_them_off_proposes_twenty_percent_and_says_why_they_cannot_be_taken(): void
    {
        $this->asStaff()->getJson($this->api('setup'))->assertOk()
            ->assertJsonPath('settings.deposits_on', false)
            ->assertJsonPath('settings.deposit_percent', 20)
            ->assertJsonPath('settings.deposits_available', false)
            ->assertJsonPath('settings.deposits_reason', 'payments_off')
            ->assertJsonPath('settings.cancel_hours', 24);
    }

    public function test_switching_on_without_stripe_is_refused(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => 20])
            ->assertStatus(422)->assertJsonPath('error', 'deposits_unavailable')->assertJsonPath('reason', 'payments_off');

        $this->assertFalse(Deposits::pageOn($this->org->id));
    }

    public function test_a_manager_switches_them_on_and_the_booking_page_reads_the_same_settings(): void
    {
        $this->stripeForDeposits();

        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => 25])->assertOk()
            ->assertJsonPath('settings.deposits_on', true)
            ->assertJsonPath('settings.deposit_percent', 25)
            ->assertJsonPath('settings.deposits_available', true);

        $this->getJson('/api/v1/services/config')->assertOk()
            ->assertJsonPath('require_deposit', true)
            ->assertJsonPath('deposit_percent', 25);
    }

    public function test_a_currency_stripe_does_not_take_is_refused(): void
    {
        $this->stripeForDeposits()->shouldReceive('currency')->andReturn('gbp');

        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true])
            ->assertStatus(422)->assertJsonPath('reason', 'currency_mismatch');
    }

    public function test_the_percent_keeps_to_one_to_a_hundred(): void
    {
        $this->stripeForDeposits();
        foreach ([0, 101] as $bad) {
            $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('deposit_percent');
        }
    }

    public function test_only_a_manager_switches_deposits(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['deposits_on' => true])->assertStatus(403);
    }

    // Deploy safety (owner, 2026-10-07: "do what is better"): the full admin's deposit tick did nothing before Part H, so a
    // venue may have ticked it long ago. That tick alone never starts deposits; switching them on in Setup does (spec §11).
    public function test_an_old_full_admin_tick_alone_takes_no_deposit_until_setup_switches_them_on(): void
    {
        $this->stripeForDeposits();
        $this->setSetting('services_require_deposit', 'true');
        $this->setSetting('services_deposit_percent', '100');

        $this->assertFalse(Deposits::switchedOn());
        $this->assertNull(Deposits::termsFor(60, 'EUR'));
        $this->assertFalse(Deposits::pageOn($this->org->id));
        $this->asStaff()->getJson($this->api('setup'))
            ->assertJsonPath('settings.deposits_on', false)
            ->assertJsonPath('settings.deposit_percent', 20);

        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => 20])->assertOk();

        $this->assertTrue(Deposits::switchedOn());
        $this->assertTrue(Deposits::pageOn($this->org->id));
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24, 'currency' => 'EUR'], Deposits::termsFor(60, 'EUR'));
    }

    public function test_a_stored_percent_is_shown_as_it_is_while_deposits_are_on(): void
    {
        $this->stripeForDeposits();
        $this->depositsOn(100);
        $this->asStaff()->getJson($this->api('setup'))->assertJsonPath('settings.deposit_percent', 100);

        $this->depositsOff();
        $this->asStaff()->getJson($this->api('setup'))->assertJsonPath('settings.deposit_percent', 20);
    }
}
