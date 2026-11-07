<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use OpenAI\Laravel\Facades\OpenAI;
use OpenAI\Responses\Chat\CreateResponse;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The chatbot set-up's AI helpers (2026-11-08): `chatbot-config/test-chat`, `chatbot-config/suggest-keywords` and
 * `knowledge/extract-faqs` stop before the provider is asked once the month's AI allowance is used up
 * (`ai_budget_used_up`, 403), record their spend, and say a provider failure in our words (`ai_failed`, 502) with the
 * provider's text in the log only. Knowledge documents no longer take `.doc`, which has no text extractor.
 */
class ChatbotHelpersTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private const SOURCE = 'Harbour Clinic is open Monday to Friday from 8 to 18. A first consultation costs 45 euros and takes thirty minutes.';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        config(['openai.api_key' => 'test-key-not-real']);
    }

    private function useUpTheAllowance(): void
    {
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'engagement' => 'true', 'ai_monthly_cost_cents' => '500']])->save();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'gpt-4o-mini', 'feature' => 'website_chatbot', 'cost_cents' => 500, 'created_at' => now()]);
    }

    private function completion(string $content): array
    {
        return ['id' => 'chatcmpl-test', 'choices' => [['index' => 0, 'message' => ['role' => 'assistant', 'content' => $content], 'finish_reason' => 'stop']],
            'usage' => ['prompt_tokens' => 300, 'completion_tokens' => 40, 'total_tokens' => 340]];
    }

    private function spend(string $feature): int
    {
        return DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->where('feature', $feature)->count();
    }

    public function test_the_used_up_allowance_stops_every_helper_before_the_provider_is_asked(): void
    {
        $this->useUpTheAllowance();
        $openai = OpenAI::fake([]);
        Http::fake();

        $this->asManager()->postJson($this->adminApi('chatbot-config/test-chat'), ['message' => 'Hello?'])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->asManager()->postJson($this->adminApi('chatbot-config/suggest-keywords'), ['question' => 'How much is a consultation?'])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->asManager()->postJson($this->adminApi('knowledge/extract-faqs'), ['source_text' => self::SOURCE])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');

        $openai->assertNothingSent();
        Http::assertNothingSent();
    }

    public function test_a_test_chat_records_its_spend_and_a_failure_is_said_in_our_words(): void
    {
        Http::fake(['api.openai.com/v1/chat/completions' => Http::sequence()
            ->push($this->completion('We are open Monday to Friday.'))
            ->push(['error' => ['message' => 'upstream secret internals']], 400)]);

        $this->asManager()->postJson($this->adminApi('chatbot-config/test-chat'), ['message' => 'When are you open?'])
            ->assertOk()->assertJsonPath('reply', 'We are open Monday to Friday.');
        $this->assertSame(1, $this->spend('chatbot_test'));

        $failed = $this->asManager()->postJson($this->adminApi('chatbot-config/test-chat'), ['message' => 'When are you open?'])
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed');
        $this->assertStringNotContainsString('secret internals', $failed->getContent());
    }

    public function test_suggested_keywords_record_their_spend_and_a_failure_is_said_in_our_words(): void
    {
        OpenAI::fake([
            CreateResponse::fake(['choices' => [['message' => ['role' => 'assistant', 'content' => '["Price", "consultation"]']]], 'usage' => ['prompt_tokens' => 120, 'completion_tokens' => 12, 'total_tokens' => 132]]),
            new \RuntimeException('upstream secret internals'),
        ]);

        $this->asManager()->postJson($this->adminApi('chatbot-config/suggest-keywords'), ['question' => 'How much is a consultation?'])
            ->assertOk()->assertJsonPath('keywords', ['price', 'consultation']);
        $this->assertSame(1, $this->spend('knowledge_keywords'));

        $failed = $this->asManager()->postJson($this->adminApi('chatbot-config/suggest-keywords'), ['question' => 'How much is a consultation?'])
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed');
        $this->assertStringNotContainsString('secret internals', $failed->getContent());
        $this->assertSame(1, $this->spend('knowledge_keywords'), 'a failed call records nothing');
    }

    public function test_extracted_faqs_record_their_spend_and_a_failure_is_said_in_our_words(): void
    {
        $items = ['items' => [['question' => 'When are you open?', 'answer' => 'Monday to Friday, 8 to 18.', 'keywords' => ['hours']]]];
        Http::fake(['api.openai.com/v1/chat/completions' => Http::sequence()
            ->push($this->completion(json_encode($items)))
            ->push(['error' => ['message' => 'upstream secret internals']], 500)]);

        $this->asManager()->postJson($this->adminApi('knowledge/extract-faqs'), ['source_text' => self::SOURCE])
            ->assertOk()->assertJsonPath('items.0.question', 'When are you open?');
        $this->assertSame(1, $this->spend('knowledge_faqs'));

        $failed = $this->asManager()->postJson($this->adminApi('knowledge/extract-faqs'), ['source_text' => self::SOURCE])
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed');
        $this->assertStringNotContainsString('secret internals', $failed->getContent());
    }

    public function test_a_doc_file_is_refused_and_a_text_file_is_taken(): void
    {
        config(['filesystems.media_disk' => 'public']);
        Storage::fake('public');

        $this->asManager()->post($this->adminApi('knowledge/documents'), ['file' => UploadedFile::fake()->create('prices.doc', 12, 'application/msword')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('file');
        $this->assertSame(0, DB::table('knowledge_documents')->count());

        $this->asManager()->post($this->adminApi('knowledge/documents'), ['file' => UploadedFile::fake()->createWithContent('prices.txt', self::SOURCE)], ['Accept' => 'application/json'])
            ->assertCreated();
        $this->assertSame(1, DB::table('knowledge_documents')->count());
    }
}
