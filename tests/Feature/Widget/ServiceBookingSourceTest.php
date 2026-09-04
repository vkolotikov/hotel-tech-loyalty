<?php

namespace Tests\Feature\Widget;

use App\Http\Controllers\Api\V1\ServicePublicController;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Template fidelity phase 6.7 — a service booking's `source` is READ, not
 * hardcoded.
 *
 * The services widget has read `?source=` and posted it since the member
 * app's WebView needed 'mobile_app', but confirm()'s validate() never listed
 * the field, so it was dropped on the floor and every booking was written
 * 'widget'. Landing pages now send 'landing', and without this the owner
 * could not answer the one question the whole booking band exists to
 * answer: is the template actually producing bookings?
 *
 * The WRITE itself cannot be exercised here: confirm() serialises slot
 * claims with a Postgres advisory lock and this suite runs on sqlite. What
 * can be pinned is the contract around it — the rule that admits a tag and
 * refuses what the 30-character column could not hold, the normalisation,
 * the default, and that a malformed tag is refused BEFORE anything is
 * written. The write is verified end to end against the local Postgres in
 * the phase report.
 */
class ServiceBookingSourceTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        DB::table('organizations')->insert([
            'id' => 1, 'name' => 'Nocturne', 'slug' => 'nocturne', 'widget_token' => 'wt-source-test-token',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_the_three_sources_in_use_pass_and_case_is_normalised(): void
    {
        foreach (['widget', 'mobile_app', 'landing', 'Landing', 'partner-embed'] as $source) {
            $this->assertTrue(
                Validator::make(['source' => $source], ['source' => ServicePublicController::SOURCE_RULES])->passes(),
                "'{$source}' is a tag and must be accepted."
            );
        }

        $this->assertSame('landing', ServicePublicController::bookingSource(['source' => 'Landing']));
        $this->assertSame('mobile_app', ServicePublicController::bookingSource(['source' => ' mobile_app ']));
    }

    public function test_no_source_means_the_widget(): void
    {
        $this->assertSame('widget', ServicePublicController::bookingSource([]));
        $this->assertSame('widget', ServicePublicController::bookingSource(['source' => '']));
        $this->assertSame('widget', ServicePublicController::bookingSource(['source' => null]));
        $this->assertSame(ServicePublicController::DEFAULT_SOURCE, ServicePublicController::bookingSource([]));
    }

    public function test_what_the_column_cannot_hold_is_refused(): void
    {
        foreach ([str_repeat('a', 31), 'landing page', 'landing!', '<script>', "land\ning"] as $bad) {
            $this->assertTrue(
                Validator::make(['source' => $bad], ['source' => ServicePublicController::SOURCE_RULES])->fails(),
                "'{$bad}' is not a tag and must be refused."
            );
        }
    }

    /**
     * Refused at the door: a malformed tag is a 422 naming `source`, and
     * nothing further runs — no booking row, no submission log. A legitimate
     * guest never produces one (the widget sets the field, not the guest),
     * so refusing is safe; accepting would be a Postgres error on the insert
     * and a lost booking.
     */
    public function test_a_malformed_source_is_refused_before_anything_is_written(): void
    {
        $response = $this->postJson('/api/v1/services/confirm', [
            'org'            => 'wt-source-test-token',
            'service_id'     => 1,
            'start_at'       => now()->addDay()->toIso8601String(),
            'customer_name'  => 'Ada',
            'customer_email' => 'ada@example.test',
            'source'         => str_repeat('landing', 5),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['source']);
    }
}
