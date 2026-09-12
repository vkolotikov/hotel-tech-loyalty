<?php

namespace Tests\Feature\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
use App\Mcp\Tools\Voice\VoiceDailyBrief;
use App\Mcp\Tools\Voice\VoiceFindCustomer;
use App\Mcp\Tools\Voice\VoiceLeadCount;
use App\Mcp\Tools\Voice\VoiceNextBookings;
use Illuminate\Support\Facades\DB;

class VoiceReadToolsTest extends VoiceTestCase
{
    public function test_lead_count_speaks_a_word_count_for_today(): void
    {
        $response = HexaTechVoiceServer::tool(VoiceLeadCount::class, []);
        $response->assertOk()->assertDontSee(['PRIVATE_EMAIL', 'PRIVATE_PHONE']);

        $data = $this->data($response);
        $this->assertSame('two leads', $data['spoken_count']);
        $this->assertSame(2, $data['count']);
        $this->assertSame('today', $data['day']);
    }

    public function test_voice_tools_refuse_an_organization_without_voice_access(): void
    {
        config(['voice.organization_ids' => []]);
        HexaTechVoiceServer::tool(VoiceLeadCount::class, [])->assertHasErrors();
    }

    public function test_daily_brief_answers_in_one_call_without_contact_details(): void
    {
        $response = HexaTechVoiceServer::tool(VoiceDailyBrief::class, []);
        $response->assertOk()->assertDontSee(['PRIVATE_EMAIL', 'PRIVATE_PHONE']);

        $data = $this->data($response);
        $this->assertSame(2, $data['lead_count']);
        $this->assertSame(1, $data['booking_count']);
        $this->assertSame('Today: two new leads and one appointment.', $data['spoken_summary']);
        $this->assertLessThanOrEqual(3, substr_count($data['spoken_summary'], '.'));
    }

    public function test_next_bookings_names_people_by_initial_and_caps_the_spoken_list(): void
    {
        $this->serviceBooking(2, '2026-09-12 10:00:00', 'Alex Romano');

        $response = HexaTechVoiceServer::tool(VoiceNextBookings::class, []);
        $response->assertOk()->assertDontSee(['PRIVATE_EMAIL', 'PRIVATE_PHONE']);

        $data = $this->data($response);
        $this->assertCount(2, $data['bookings']);
        $this->assertStringContainsString('Morgan L.', $data['spoken_summary']);
        $this->assertStringNotContainsString('Lee', $data['spoken_summary']);

        // An allowlist, not a denylist: only these keys may ever reach speech.
        foreach ($data['bookings'] as $booking) {
            $this->assertSame([], array_diff(array_keys($booking),
                ['id', 'kind', 'start', 'status', 'spoken_name', 'contact_on_file']));
        }
    }

    public function test_next_bookings_never_speaks_money(): void
    {
        $data = $this->data(HexaTechVoiceServer::tool(VoiceNextBookings::class, []));
        $encoded = json_encode($data);

        // The service booking fixture carries 4500 EUR; spec §7 keeps amounts
        // out of speech unless they were explicitly asked for.
        foreach (['4500', 'EUR', 'total_amount', 'currency', 'payment_status'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $encoded);
        }
    }

    public function test_find_customer_separates_matches_by_company_when_names_collide(): void
    {
        DB::table('guests')->where('id', 1)->update(['company' => 'Northside']);
        $this->guest(3, 'Morgan Lloyd', ['company' => 'Riverside']);

        $response = HexaTechVoiceServer::tool(VoiceFindCustomer::class, ['query' => 'Morgan']);
        $response->assertOk()->assertDontSee(['PRIVATE_EMAIL', 'PRIVATE_PHONE']);

        $data = $this->data($response);
        $this->assertTrue($data['needs_disambiguation']);
        // Both render as "Morgan L.", so the company is what makes the question answerable.
        $this->assertStringContainsString('Morgan L. at Northside', $data['spoken_summary']);
        $this->assertStringContainsString('Morgan L. at Riverside', $data['spoken_summary']);
        $this->assertStringContainsString('Which one do you mean?', $data['spoken_summary']);
    }

    public function test_find_customer_asks_for_more_detail_when_matches_sound_identical(): void
    {
        $this->guest(3, 'Morgan Lloyd');

        $data = $this->data(HexaTechVoiceServer::tool(VoiceFindCustomer::class, ['query' => 'Morgan']));

        $this->assertTrue($data['needs_disambiguation']);
        // Offering "Morgan L. or Morgan L.?" aloud is not a question anyone can answer.
        $this->assertStringContainsString('two people called Morgan L.', $data['spoken_summary']);
        $this->assertStringContainsString('surname', $data['spoken_summary']);
    }

    public function test_find_customer_rejects_a_blank_search(): void
    {
        HexaTechVoiceServer::tool(VoiceFindCustomer::class, ['query' => ' '])->assertHasErrors();
        HexaTechVoiceServer::tool(VoiceFindCustomer::class, [])->assertHasErrors();
    }

    public function test_a_customer_from_another_organization_is_never_reachable(): void
    {
        $found = $this->data(HexaTechVoiceServer::tool(VoiceFindCustomer::class, ['query' => 'FOREIGN']));

        $this->assertSame(0, $found['match_count']);
        $this->assertStringContainsString('could not find', $found['spoken_summary']);
    }

    public function test_daily_brief_never_speaks_a_full_page_as_a_total(): void
    {
        // One more than the page the brief asks for, so more certainly exist.
        for ($id = 2; $id <= 52; $id++) {
            $this->serviceBooking($id, '2026-09-12 09:00:00', 'Morgan Lee');
        }

        $data = $this->data(HexaTechVoiceServer::tool(VoiceDailyBrief::class, []));

        $this->assertTrue($data['booking_count_is_partial']);
        $this->assertStringContainsString('at least fifty appointments', $data['spoken_summary']);
    }
}
