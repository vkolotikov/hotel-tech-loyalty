<?php

namespace Tests\Feature\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
use App\Mcp\Tools\Voice\VoiceDailyBrief;
use App\Mcp\Tools\Voice\VoiceLeadCount;
use App\Mcp\Tools\Voice\VoiceNextBookings;

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
