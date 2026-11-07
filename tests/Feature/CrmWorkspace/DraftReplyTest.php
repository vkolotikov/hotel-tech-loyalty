<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\KnowledgeItem;
use App\Models\Organization;
use App\Services\KnowledgeService;
use Illuminate\Support\Collection;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use OpenAI\Laravel\Facades\OpenAI;
use OpenAI\Resources\Chat;
use OpenAI\Responses\Chat\CreateResponse;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/** "Draft a reply" in the inbox (2026-11-07): a draft for a person to send, the venue's facts, the AI allowance. */
class DraftReplyTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        // The knowledge search is PostgreSQL SQL (ILIKE), the widget's own; on the tests' SQLite a stand-in reads the
        // same active answers by word. Run on PostgreSQL (scripts/test-pg.sh), the real search answers.
        if (DB::connection()->getDriverName() === 'sqlite') {
            $this->app->instance(KnowledgeService::class, new class extends KnowledgeService {
                public function searchRelevantItems(string $query, int $orgId, int $limit = 5): Collection
                {
                    $words = array_filter(preg_split('/\W+/u', mb_strtolower($query)), fn ($w) => mb_strlen($w) > 3);

                    return KnowledgeItem::query()->where('is_active', true)->get()
                        ->filter(fn (KnowledgeItem $i) => collect($words)->contains(fn ($w) => str_contains(mb_strtolower($i->question), $w)))
                        ->take($limit)->values();
                }
            });
        }
    }

    private function reply(string $text): CreateResponse
    {
        return CreateResponse::fake(['choices' => [['message' => ['role' => 'assistant', 'content' => $text]]], 'usage' => ['prompt_tokens' => 400, 'completion_tokens' => 50, 'total_tokens' => 450]]);
    }

    public function test_a_draft_speaks_from_the_venues_knowledge_records_its_spend_and_sends_nothing(): void
    {
        $fake = OpenAI::fake([$this->reply('A first consultation costs 45 €. Shall I book you in?')]);
        DB::table('chatbot_behavior_configs')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'assistant_name' => 'Ava', 'tone' => 'friendly', 'reply_length' => 'concise', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'question' => 'How much is a consultation?', 'answer' => 'A first consultation costs 45 €.', 'keywords' => json_encode(['consultation', 'price']), 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $chat = $this->chat(['status' => 'waiting'], [['visitor', 'How much is a consultation?', 2]]);
        $messagesBefore = DB::table('chat_messages')->count();

        $this->asStaffMember()->postJson($this->crmApi("conversations/{$chat}/draft"), ['instruction' => 'offer Friday'])->assertOk()
            ->assertJsonPath('draft', 'A first consultation costs 45 €. Shall I book you in?');

        $fake->assertSent(Chat::class, function (string $method, array $parameters): bool {
            $prompt = $parameters['messages'][0]['content'];

            return $method === 'create'
                && str_contains($prompt, 'A first consultation costs 45 €.')
                && str_contains($prompt, 'friendly tone')
                && str_contains($prompt, 'offer Friday')
                && str_contains($prompt, '[VISITOR] How much is a consultation?');
        });
        $this->assertSame($messagesBefore, DB::table('chat_messages')->count(), 'a draft sends nothing');
        $this->assertSame(0, (int) DB::table('knowledge_items')->value('use_count'), 'a draft is not a use of the answer');
        $this->assertSame('crm_draft', DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->value('feature'));
    }

    public function test_the_used_up_allowance_stops_before_the_provider_is_asked(): void
    {
        $fake = OpenAI::fake([]);
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'ai_monthly_cost_cents' => '500']])->save();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'gpt-4o-mini', 'feature' => 'website_chatbot', 'cost_cents' => 500, 'created_at' => now(), 'updated_at' => now()]);
        $chat = $this->chat([], [['visitor', 'Hello?', 1]]);

        $this->asStaffMember()->postJson($this->crmApi("conversations/{$chat}/draft"))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $fake->assertNothingSent();
    }

    public function test_nothing_to_answer_another_organisations_chat_and_a_plan_without_the_chatbot(): void
    {
        $fake = OpenAI::fake([]);
        $empty = $this->chat([], [['ai', 'Welcome!', 1]]);
        $this->asStaffMember()->postJson($this->crmApi("conversations/{$empty}/draft"))->assertStatus(422)->assertJsonPath('error', 'nothing_to_answer');

        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);
        $theirs = DB::table('chat_conversations')->insertGetId(['organization_id' => $other->id, 'status' => 'waiting', 'created_at' => now(), 'updated_at' => now()]);
        $this->asStaffMember()->postJson($this->crmApi("conversations/{$theirs}/draft"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $fake->assertNothingSent();
    }

    public function test_a_plan_without_the_chatbot_drafts_nothing(): void
    {
        $fake = OpenAI::fake([]);
        $this->org->forceFill(['plan_features' => ['engagement' => 'true']])->save();
        $chat = $this->chat([], [['visitor', 'Hello?', 1]]);

        $this->asStaffMember()->postJson($this->crmApi("conversations/{$chat}/draft"))->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        $fake->assertNothingSent();
    }

    public function test_a_provider_failure_is_said_in_our_words(): void
    {
        OpenAI::fake([new \RuntimeException('upstream 500: secret internals')]);
        $chat = $this->chat([], [['visitor', 'Hello?', 1]]);

        $response = $this->asStaffMember()->postJson($this->crmApi("conversations/{$chat}/draft"))->assertStatus(502)->assertJsonPath('error', 'ai_failed');
        $this->assertStringNotContainsString('secret internals', $response->getContent());
    }
}
