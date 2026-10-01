<?php

namespace Tests\Concerns;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;

/**
 * Everything an appointments-workspace test needs: the tables (built from
 * the repo's own schema traits, plus the columns only this workspace
 * reads), a loyalty-on beauty organisation with the workspace switched on,
 * a staff caller, one bookable service and team member, and a fixed clock.
 *
 * A test class uses `DatabaseTransactions` and this trait — NOT the traits
 * it composes — and calls setUpAppointments() from setUp().
 *
 * The clock is Monday 5 October 2026, 06:00 on the application clock (UTC).
 * The seeded team member (Mara Ilves) works 09:00–17:00 every day and
 * performs "Deep Tissue Massage" (45 minutes, 60.00 EUR).
 */
trait SetsUpAppointmentsSchema
{
    use SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture, MakesAdminCaller;

    protected Organization $org;
    protected User $staff;
    protected LoyaltyMember $member;
    protected LoyaltyTier $tier;
    protected Service $service;
    protected ServiceMaster $master;

    protected function setUpAppointments(bool $enabled = true): void
    {
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();

        $this->addColumnsIfMissing('organizations', [
            'settings' => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone' => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency' => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
        ]);
        $this->addColumnsIfMissing('guests', [
            'email_key' => fn (Blueprint $t) => $t->string('email_key')->nullable(),
            'phone_key' => fn (Blueprint $t) => $t->string('phone_key')->nullable(),
            'mobile'    => fn (Blueprint $t) => $t->string('mobile')->nullable(),
        ]);
        $this->addColumnsIfMissing('service_masters', [
            'title'      => fn (Blueprint $t) => $t->string('title')->nullable(),
            'sort_order' => fn (Blueprint $t) => $t->integer('sort_order')->default(0),
        ]);

        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));

        $fixture = $this->seedPointsFixture('Lumière Salon');
        $this->org = Organization::findOrFail($fixture['orgId']);
        $this->member = $fixture['member'];
        $this->tier = $fixture['tier'];
        // Every organisation has the workspace unless it was switched off.
        if (!$enabled) {
            $this->org->setWorkspace('appointments', false);
        }
        $this->staff = $this->staffUser($this->org);

        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);

        // VenueClock memoises the venue's zone per request; a test is many.
        app()->forgetScopedInstances();
    }

    /** A client with a phone number and no email — never auto-enrolled, so never a member. */
    protected function seedClient(array $attrs = []): Guest
    {
        return Guest::create(array_merge([
            'organization_id' => $this->org->id,
            'full_name'       => 'Sophie Williams',
            'first_name'      => 'Sophie',
            'last_name'       => 'Williams',
            'phone'           => '+44 7700 900123',
            'phone_key'       => '447700900123',
        ], $attrs));
    }

    /** A client linked to the fixture's Gold member. */
    protected function seedMemberClient(): Guest
    {
        return $this->seedClient([
            'full_name'  => 'Ada Member',
            'first_name' => 'Ada',
            'last_name'  => 'Member',
            'email'      => 'ada@example.test',
            'email_key'  => 'ada@example.test',
            'phone'      => null,
            'phone_key'  => null,
            'member_id'  => $this->member->id,
        ]);
    }

    /** A confirmed, unpaid 10:00–10:45 appointment tomorrow with the seeded team member. */
    protected function seedBooking(array $attrs = []): ServiceBooking
    {
        return ServiceBooking::create(array_merge([
            'organization_id'   => $this->org->id,
            'service_id'        => $this->service->id,
            'service_master_id' => $this->master->id,
            'customer_name'     => 'Sophie Williams',
            'customer_email'    => '',
            'customer_phone'    => '+44 7700 900123',
            'start_at'          => '2026-10-06 10:00:00',
            'end_at'            => '2026-10-06 10:45:00',
            'duration_minutes'  => 45,
            'service_price'     => 60,
            'total_amount'      => 60,
            'currency'          => 'EUR',
            'status'            => 'confirmed',
            'payment_status'    => 'unpaid',
            'source'            => 'admin',
        ], $attrs));
    }

    protected function asStaff(): static
    {
        return $this->actingAs($this->staff, 'sanctum');
    }

    protected function api(string $path): string
    {
        return '/api/v1/admin/appointments/' . ltrim($path, '/');
    }

    protected function otherOrganization(): Organization
    {
        return Organization::create(['name' => 'Other Studio', 'slug' => 'other-' . uniqid(), 'industry' => 'beauty']);
    }

    /**
     * Run $fn with another organisation bound as the tenant. Every model
     * with BelongsToOrganization FORCES organization_id from the bound
     * tenant on create — an `organization_id` in the attributes is
     * overwritten — so a row for another organisation can only be made
     * this way.
     */
    protected function inOrganization(int $orgId, callable $fn): mixed
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        try {
            return $fn();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }
}
