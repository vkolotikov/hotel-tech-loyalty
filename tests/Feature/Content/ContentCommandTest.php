<?php

namespace Tests\Feature\Content;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class ContentCommandTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_it_reports_switches_and_lists_the_exceptions(): void
    {
        $plain = Organization::create(['name' => 'Other Studio', 'slug' => 'plain-' . uniqid(), 'industry' => 'beauty']);

        $this->artisan('workspace:content', ['--list' => true])
            ->expectsOutputToContain('Every organization has HexaTech Content on, landing on the full admin.')
            ->assertSuccessful();

        $this->artisan('workspace:content', ['org' => $plain->id, '--status' => true])
            ->expectsOutputToContain('HexaTech Content ON, landing off')
            ->assertSuccessful();

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true, '--landing' => true])
            ->expectsOutputToContain('HexaTech Content ON, landing on')
            ->assertSuccessful();
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('content'));
        $this->assertFalse($this->org->fresh()->workspace('appointments')['landing']);

        $this->artisan('workspace:content', ['--list' => true])
            ->expectsOutputToContain('Lumière Salon')
            ->doesntExpectOutputToContain('Other Studio')
            ->assertSuccessful();

        $this->artisan('workspace:content', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('HexaTech Content off')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('content'));

        $this->artisan('workspace:content', ['org' => 999999, '--on' => true])->assertFailed();
        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true, '--off' => true])->assertFailed();
    }

    public function test_it_will_not_switch_content_on_for_the_appointments_plan(): void
    {
        $this->org->setAppointmentsOnly(true);

        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true])
            ->expectsOutputToContain('is on the Appointments plan')
            ->assertFailed();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('content'));
    }
}
