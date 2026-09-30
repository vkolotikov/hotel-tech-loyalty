<?php

namespace Tests\Feature\Appointments;

use App\Models\Guest;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class ClientEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function search(string $term): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('clients') . '?' . http_build_query(['search' => $term]));
    }

    public function test_search_finds_a_client_by_name_phone_digits_or_email(): void
    {
        $sophie = $this->seedClient();
        $ada = $this->seedMemberClient();

        $this->assertSame([$sophie->id], array_column($this->search('soph')->assertOk()->json('clients'), 'id'));
        $this->assertSame([$sophie->id], array_column($this->search('7700 900')->json('clients'), 'id'));
        $this->assertSame([$ada->id], array_column($this->search('ADA@EXAMPLE')->json('clients'), 'id'));
        $this->assertSame([], $this->search('nobody')->json('clients'));
    }

    public function test_a_search_row_carries_the_membership(): void
    {
        $this->seedMemberClient();

        $this->search('ada')->assertOk()
            ->assertJsonPath('clients.0.name', 'Ada Member')
            ->assertJsonPath('clients.0.email', 'ada@example.test')
            ->assertJsonPath('clients.0.phone', null)
            ->assertJsonPath('clients.0.member.number', $this->member->member_number)
            ->assertJsonPath('clients.0.member.tier', 'Gold');
    }

    public function test_search_needs_two_characters_and_never_crosses_organisations(): void
    {
        $this->inOrganization($this->otherOrganization()->id, fn () => Guest::create(['full_name' => 'Sophie Elsewhere', 'phone' => '1', 'phone_key' => '1']));

        $this->search('s')->assertStatus(422);
        $this->assertSame([], $this->search('Elsewhere')->assertOk()->json('clients'));
    }

    public function test_a_client_is_created_with_a_name_and_a_phone_number(): void
    {
        $response = $this->asStaff()->postJson($this->api('clients'), ['name' => 'Mia Taylor', 'phone' => '+44 (7700) 900-456'])
            ->assertStatus(201)
            ->assertJsonPath('client.name', 'Mia Taylor')
            ->assertJsonPath('client.phone', '+44 (7700) 900-456')
            ->assertJsonPath('client.email', null);

        $guest = Guest::findOrFail($response->json('client.id'));
        $this->assertSame($this->org->id, (int) $guest->organization_id);
        $this->assertSame('447700900456', $guest->phone_key);
        $this->assertSame('Mia', $guest->first_name);
        $this->assertSame('Taylor', $guest->last_name);
        $this->assertSame('Appointments', $guest->lead_source);
    }

    public function test_a_client_needs_a_name_and_a_way_to_reach_them(): void
    {
        $this->asStaff()->postJson($this->api('clients'), ['name' => 'No Contact'])->assertStatus(422);
        $this->asStaff()->postJson($this->api('clients'), ['phone' => '123456'])->assertStatus(422);
        $this->asStaff()->postJson($this->api('clients'), ['name' => 'Bad Mail', 'email' => 'not-an-email'])->assertStatus(422);
    }

    public function test_a_possible_duplicate_is_shown_not_merged_and_not_silently_created(): void
    {
        $existing = $this->seedClient(); // +44 7700 900123
        $count = Guest::count();

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'S. Williams', 'phone' => '+447700900123'])
            ->assertStatus(409)
            ->assertJsonPath('error', 'possible_duplicate')
            ->assertJsonPath('matches.0.id', $existing->id)
            ->assertJsonPath('matches.0.name', 'Sophie Williams');
        $this->assertSame($count, Guest::count());

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'S. Williams', 'phone' => '+447700900123', 'confirm_new' => true])
            ->assertStatus(201);
        $this->assertSame($count + 1, Guest::count());
        $this->assertSame('Sophie Williams', $existing->fresh()->full_name);
    }

    public function test_the_same_email_in_another_case_is_a_possible_duplicate(): void
    {
        $ada = $this->seedMemberClient();

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'Ada Again', 'email' => 'ADA@Example.Test'])
            ->assertStatus(409)->assertJsonPath('matches.0.id', $ada->id);
    }

    public function test_the_profile_splits_upcoming_past_and_email_matched_appointments(): void
    {
        $ada = $this->seedMemberClient();
        $upcoming = $this->seedBooking(['guest_id' => $ada->id, 'member_id' => $this->member->id]);
        $past = $this->seedBooking(['guest_id' => $ada->id, 'status' => 'completed', 'start_at' => '2026-09-20 10:00:00', 'end_at' => '2026-09-20 10:45:00']);
        $cancelled = $this->seedBooking(['guest_id' => $ada->id, 'status' => 'cancelled', 'start_at' => '2026-10-08 10:00:00', 'end_at' => '2026-10-08 10:45:00']);
        $byEmail = $this->seedBooking(['customer_email' => 'Ada@Example.test', 'start_at' => '2026-08-01 10:00:00', 'end_at' => '2026-08-01 10:45:00']);
        $this->seedBooking(['customer_email' => 'someone@else.test', 'start_at' => '2026-08-02 10:00:00', 'end_at' => '2026-08-02 10:45:00']);

        $response = $this->asStaff()->getJson($this->api("clients/{$ada->id}"))->assertOk();

        $this->assertSame([$upcoming->id], array_column($response->json('upcoming'), 'id'));
        $this->assertSame([$cancelled->id, $past->id], array_column($response->json('past'), 'id'));
        $this->assertSame([$byEmail->id], array_column($response->json('matched_by_email'), 'id'));
        $response->assertJsonPath('client.id', $ada->id)
            ->assertJsonPath('loyalty.member.tier', 'Gold')
            ->assertJsonPath('last.service_id', $this->service->id)
            ->assertJsonPath('last.master_id', $this->master->id);
    }

    public function test_a_client_who_is_not_a_member_has_a_card_without_a_member(): void
    {
        $sophie = $this->seedClient();

        $this->asStaff()->getJson($this->api("clients/{$sophie->id}"))->assertOk()
            ->assertJsonPath('loyalty.member', null)
            ->assertJsonPath('last', null)
            ->assertJsonPath('upcoming', [])
            ->assertJsonPath('matched_by_email', []);
    }

    public function test_another_organisations_client_is_not_found(): void
    {
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => Guest::create(['full_name' => 'Theirs', 'phone' => '1', 'phone_key' => '1']));

        $this->asStaff()->getJson($this->api("clients/{$theirs->id}"))->assertStatus(404)->assertJsonPath('error', 'client_not_found');
    }
}
