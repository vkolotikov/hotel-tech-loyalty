<?php

namespace Tests\Feature\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
use App\Mcp\Tools\Voice\VoiceDailyBrief;
use App\Mcp\Tools\Voice\VoiceLeadCount;

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
