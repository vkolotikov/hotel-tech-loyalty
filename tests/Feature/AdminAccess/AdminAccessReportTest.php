<?php

namespace Tests\Feature\AdminAccess;

use App\Support\AdminAccess\AccessRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AdminAccessReportTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function seedRecord(): void
    {
        $r = app(AccessRecorder::class);
        $colleague = $this->staffUser($this->org, ['role' => 'staff']);
        $r->record($this->org->id, $this->staff->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $r->record($this->org->id, $this->staff->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $r->record($this->org->id, $colleague->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $r->record($this->org->id, $colleague->id, null, 'admin/members', 'GET', 'not_in_plan', true);

        $this->travelTo(CarbonImmutable::parse('2026-09-20 09:00:00'));
        $r->record($this->org->id, $this->staff->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));

        $other = $this->otherOrganization();
        $r->record($other->id, $this->staff->id, 'staff', 'admin/team', 'POST', 'not_allowed', false);
    }

    public function test_it_says_the_mode_and_sums_by_rule_method_and_outcome(): void
    {
        $this->seedRecord();

        $this->artisan('admin-access:report', ['--org' => $this->org->id])
            ->expectsOutputToContain('Mode: report')
            // One written line satisfies one expectation: each table row is asserted whole.
            ->expectsOutputToContain('| admin/settings | PUT    | not_allowed | would refuse | 3     | 2      | 1             |')
            ->expectsOutputToContain('| admin/members  | GET    | not_in_plan | refused      | 1     | 1      | 1             |')
            ->expectsOutputToContain('Would refuse: 3 call(s) by 2 person(s) in 1 organization(s).')
            ->expectsOutputToContain('Refused: 1 call(s) by 1 person(s) in 1 organization(s).')
            ->doesntExpectOutputToContain('admin/team')
            ->assertSuccessful();

        $this->artisan('admin-access:report', ['--org' => $this->org->id, '--days' => 30])
            ->expectsOutputToContain('Would refuse: 4 call(s) by 2 person(s) in 1 organization(s).')
            ->assertSuccessful();

        $this->artisan('admin-access:report')
            ->expectsOutputToContain('admin/team')
            ->expectsOutputToContain('Would refuse: 4 call(s) by 2 person(s) in 2 organization(s).')
            ->assertSuccessful();
    }

    public function test_it_names_enforce_mode_and_an_empty_record(): void
    {
        config(['admin_access.mode' => 'enforce']);

        $this->artisan('admin-access:report')
            ->expectsOutputToContain('Mode: enforce')
            ->expectsOutputToContain('Nothing refused or recorded in the last 7 day(s).')
            ->assertSuccessful();
    }
}
