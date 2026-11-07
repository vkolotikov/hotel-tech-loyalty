<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/** HexaTech CRM's setup steps (2026-11-07): each done when the data says so. */
class StartTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    private function steps(): array
    {
        $body = $this->asStaffMember()->getJson($this->crmApi('start'))->assertOk()->json();

        return [collect($body['steps'])->pluck('done', 'key')->all(), $body['done'], $body['complete']];
    }

    public function test_a_new_organisation_has_only_its_team(): void
    {
        [$steps, $done, $complete] = $this->steps();

        $this->assertSame(['widget' => false, 'assistant' => false, 'knowledge' => false, 'reply' => false, 'pipeline' => false, 'team' => true], $steps, 'the fixture has two staff');
        $this->assertSame([1, false], [$done, $complete]);
    }

    public function test_each_step_is_done_by_what_was_done(): void
    {
        $chat = $this->chat([], [['visitor', 'Hi', 3], ['agent', 'Hello, how can we help?', 2]]);
        DB::table('chatbot_behavior_configs')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'assistant_name' => 'Ava', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('knowledge_documents')->insert(['organization_id' => $this->org->id, 'file_name' => 'prices.pdf', 'processing_status' => 'completed', 'extracted_text' => 'Prices', 'created_at' => now(), 'updated_at' => now()]);
        $pipeline = DB::table('pipelines')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Patients', 'is_default' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pipeline_stages')->insert(['organization_id' => $this->org->id, 'pipeline_id' => $pipeline, 'name' => 'New', 'kind' => 'open', 'created_at' => now(), 'updated_at' => now()]);

        [$steps, $done, $complete] = $this->steps();

        $this->assertSame(['widget' => true, 'assistant' => true, 'knowledge' => true, 'reply' => true, 'pipeline' => true, 'team' => true], $steps);
        $this->assertSame([6, true], [$done, $complete]);
        $this->assertGreaterThan(0, $chat);
    }

    public function test_four_answers_are_not_yet_enough_knowledge(): void
    {
        foreach (range(1, 4) as $n) {
            DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'question' => "Q{$n}", 'answer' => "A{$n}", 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->assertFalse($this->steps()[0]['knowledge']);

        DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'question' => 'Q5', 'answer' => 'A5', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertTrue($this->steps()[0]['knowledge']);
    }
}
