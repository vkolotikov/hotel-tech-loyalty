<?php

namespace Tests\Feature\Voice;

use App\Mcp\Tools\Voice\VoiceCommitNote;
use App\Mcp\Tools\Voice\VoiceLeadCount;
use App\Voice\VoiceToolCatalogue;

class VoiceToolCatalogueTest extends VoiceTestCase
{
    public function test_every_registered_voice_tool_is_offered_to_the_model(): void
    {
        $definitions = (new VoiceToolCatalogue)->definitions();
        $names = array_column(array_column($definitions, 'function'), 'name');

        // Derived from HexaTechVoiceServer, so a new tool needs no second list.
        $this->assertSame([
            'voice_daily_brief', 'voice_lead_count', 'voice_next_bookings',
            'voice_find_customer', 'voice_propose_note', 'voice_commit_note',
        ], $names);

        foreach ($definitions as $definition) {
            $this->assertSame('function', $definition['type']);
            $this->assertNotSame('', $definition['function']['description']);
            $this->assertSame('object', $definition['function']['parameters']['type']);
            $this->assertFalse($definition['function']['parameters']['additionalProperties']);
        }
    }

    public function test_a_tool_name_resolves_back_to_its_class(): void
    {
        $catalogue = new VoiceToolCatalogue;

        $this->assertSame(VoiceLeadCount::class, $catalogue->classFor('voice_lead_count'));
        $this->assertSame(VoiceCommitNote::class, $catalogue->classFor('voice_commit_note'));
        $this->assertNull($catalogue->classFor('list_leads'), 'Only voice tools are reachable.');
        $this->assertNull($catalogue->classFor('nonsense'));
    }

    public function test_the_runner_executes_a_tool_and_reports_failures_without_throwing(): void
    {
        $runner = new \App\Voice\VoiceToolRunner(new VoiceToolCatalogue);

        $ok = $runner->run('voice_lead_count', []);
        $this->assertTrue($ok['ok']);
        $this->assertSame('two leads', $ok['result']['spoken_count']);

        $unknown = $runner->run('list_leads', []);
        $this->assertFalse($unknown['ok']);
        $this->assertStringContainsString('not available', $unknown['error']);

        $invalid = $runner->run('voice_find_customer', ['query' => ' ']);
        $this->assertFalse($invalid['ok']);
        $this->assertNotSame('', $invalid['error']);

        config(['voice.organization_ids' => []]);
        $denied = $runner->run('voice_lead_count', []);
        $this->assertFalse($denied['ok'], 'The capability gate still applies through the gateway.');
    }
}
