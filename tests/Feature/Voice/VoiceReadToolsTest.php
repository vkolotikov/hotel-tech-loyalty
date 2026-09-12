<?php

namespace Tests\Feature\Voice;

use App\Mcp\Servers\HexaTechVoiceServer;
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
}
