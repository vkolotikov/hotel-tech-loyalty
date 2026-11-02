<?php

namespace Tests\Feature\Ai;

use App\Services\Ai\AnthropicSdk;
use App\Services\CrmAiService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The CRM assistant's Claude call on the official SDK (1 Nov 2026; it was the last raw call on API version 2023-06-01):
 * what the move changed. The call's retries, usage records and plan gate are CrmAiServiceCallTest's.
 *
 *  - No sampling field is ever sent (API version 2026-10-21 refuses them).
 *  - The five extractions force their tool where the model allows it. Claude Fable 5.1, Mythos 5.1, Opus 5.5 and
 *    Sonnet 5.5 refuse a forced tool choice (400): there the tool is asked for in the system prompt, and a reply
 *    without the call is asked for once more.
 *  - The chat loop sends the assistant turn back as the SDK's blocks: a thinking block keeps its signature and an
 *    empty tool input goes back as {}.
 *  - A dropped connection is tried three times, then answered with the readable fallback, as before.
 */
class CrmAiServiceSdkTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAiUsageSchema();
        app()->instance('current_organization_id', OrganizationFactory::new()->create()->id);
        config(['services.anthropic.api_key' => 'sk-ant-test']);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function service(string $model): CrmAiService
    {
        config(['services.anthropic.model' => $model]);

        return new CrmAiService();
    }

    private function callService(CrmAiService $service, array $tools = [], ?array $toolChoice = null): array
    {
        $call = new ReflectionMethod($service, 'call');

        return $call->invokeArgs($service, ['Extract the lead.', [['role' => 'user', 'content' => 'Anna, 2 nights in May']], $tools, $toolChoice]);
    }

    private static function reply(array $content, string $stop = 'end_turn'): array
    {
        return [
            'id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
            'stop_reason' => $stop, 'stop_sequence' => null, 'content' => $content,
            'usage' => ['input_tokens' => 10, 'output_tokens' => 5],
        ];
    }

    private static function leadTool(): array
    {
        return [[
            'name' => 'save_chat_lead', 'description' => 'Save the lead.',
            'input_schema' => ['type' => 'object', 'properties' => ['customer_name' => ['type' => 'string']], 'required' => ['customer_name']],
        ]];
    }

    public function test_the_request_carries_no_sampling_field(): void
    {
        Http::fake(['api.anthropic.com/*' => Http::response(self::reply([['type' => 'text', 'text' => 'OK']]))]);

        $this->callService($this->service('claude-sonnet-5'));

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            return $request->url() === 'https://api.anthropic.com/v1/messages'
                && !array_intersect(['temperature', 'top_p', 'top_k'], array_keys($body));
        });
    }

    public function test_a_model_that_takes_a_forced_tool_choice_gets_it_as_before(): void
    {
        Http::fake(['api.anthropic.com/*' => Http::response(self::reply(
            [['type' => 'tool_use', 'id' => 'toolu_1', 'name' => 'save_chat_lead', 'input' => ['customer_name' => 'Anna']]], 'tool_use',
        ))]);

        $result = $this->callService($this->service('claude-sonnet-5'), self::leadTool(), ['type' => 'tool', 'name' => 'save_chat_lead']);

        $this->assertSame(['type' => 'tool_use', 'id' => 'toolu_1', 'name' => 'save_chat_lead', 'input' => ['customer_name' => 'Anna']], $result['content'][0]);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => $r->data()['tool_choice'] === ['type' => 'tool', 'name' => 'save_chat_lead']
            && $r->data()['system'] === 'Extract the lead.'
            && $r->data()['tools'][0]['input_schema']['required'] === ['customer_name']);
    }

    public function test_a_model_that_refuses_a_forced_choice_is_asked_in_the_prompt(): void
    {
        Http::fake(['api.anthropic.com/*' => Http::response(self::reply(
            [['type' => 'tool_use', 'id' => 'toolu_1', 'name' => 'save_chat_lead', 'input' => ['customer_name' => 'Anna']]], 'tool_use',
        ))]);

        $result = $this->callService($this->service('claude-sonnet-5-5'), self::leadTool(), ['type' => 'tool', 'name' => 'save_chat_lead']);

        $this->assertSame('save_chat_lead', $result['content'][0]['name']);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => $r->data()['tool_choice'] === ['type' => 'auto']
            && str_ends_with($r->data()['system'], 'Answer only by calling the save_chat_lead tool, once, with what you found.'));
    }

    public function test_a_reply_without_the_asked_tool_is_asked_for_once_more(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->push(self::reply([['type' => 'text', 'text' => 'Here is the lead: Anna.']]))
            ->push(self::reply([['type' => 'tool_use', 'id' => 'toolu_2', 'name' => 'save_chat_lead', 'input' => ['customer_name' => 'Anna']]], 'tool_use'));

        $result = $this->callService($this->service('claude-opus-5-5'), self::leadTool(), ['type' => 'tool', 'name' => 'save_chat_lead']);

        $this->assertSame('toolu_2', $result['content'][0]['id']);
        Http::assertSentCount(2);
    }

    public function test_a_second_reply_without_the_tool_is_returned_for_the_caller_to_report(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->push(self::reply([['type' => 'text', 'text' => 'No lead here.']]))
            ->push(self::reply([['type' => 'text', 'text' => 'Still no lead.']]));

        $result = $this->callService($this->service('claude-fable-5-1'), self::leadTool(), ['type' => 'tool', 'name' => 'save_chat_lead']);

        $this->assertSame([['type' => 'text', 'text' => 'Still no lead.']], $result['content']);
        Http::assertSentCount(2);
    }

    public function test_the_chat_loop_sends_the_assistant_turn_back_with_its_thinking_and_an_empty_input_as_an_object(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->push(self::reply([
                ['type' => 'thinking', 'thinking' => '', 'signature' => 'sig-1'],
                ['type' => 'tool_use', 'id' => 'toolu_1', 'name' => 'not_a_crm_tool', 'input' => new \stdClass()],
            ], 'tool_use'))
            ->push(self::reply([['type' => 'text', 'text' => 'Done.']]));

        $answer = $this->service('claude-sonnet-5')->chat([['role' => 'user', 'content' => 'Anything new?']]);

        $this->assertSame('Done.', $answer['response']);
        $this->assertSame([['tool' => 'not_a_crm_tool', 'input' => [], 'success' => false]], $answer['actions']);

        $bodies = [];
        Http::assertSent(function (Request $r) use (&$bodies) { $bodies[] = $r->body(); return true; });
        $second = json_decode($bodies[1]);
        $this->assertSame('assistant', $second->messages[1]->role);
        $this->assertSame('sig-1', $second->messages[1]->content[0]->signature);
        $this->assertEquals(new \stdClass(), $second->messages[1]->content[1]->input, 'An empty tool input must go back as {}, not [].');
        $this->assertSame('toolu_1', $second->messages[2]->content[0]->tool_use_id);
    }

    public function test_a_dropped_connection_is_tried_three_times_then_answered_readably(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->pushFailedConnection('cURL error 7')
            ->pushFailedConnection('cURL error 7')
            ->pushFailedConnection('cURL error 7');

        $result = $this->callService($this->service('claude-sonnet-5'));

        $this->assertStringStartsWith('AI service unreachable', $result['content'][0]['text']);
        Http::assertSentCount(3);
    }

    public function test_a_dropped_connection_that_recovers_answers_normally(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->pushFailedConnection('cURL error 7')
            ->push(self::reply([['type' => 'text', 'text' => 'Back.']]));

        $result = $this->callService($this->service('claude-sonnet-5'));

        $this->assertSame('Back.', $result['content'][0]['text']);
        Http::assertSentCount(2);
    }

    public static function forcedChoiceModels(): array
    {
        return [
            'Sonnet 5'             => ['claude-sonnet-5', true],
            'Sonnet 5, dated'      => ['claude-sonnet-5-20260115', true],
            'Opus 5'               => ['claude-opus-5', true],
            'Fable 5'              => ['claude-fable-5', true],
            'Haiku 5.5'            => ['claude-haiku-5-5', true],
            'Haiku 4.5'            => ['claude-haiku-4-5', true],
            'Sonnet 4.6'           => ['claude-sonnet-4-6', true],
            'Sonnet 5.5'           => ['claude-sonnet-5-5', false],
            'Opus 5.5'             => ['claude-opus-5-5', false],
            'Fable 5.1'            => ['claude-fable-5-1', false],
            'Mythos 5.1'           => ['claude-mythos-5-1', false],
            'a later model'        => ['claude-opus-6', false],
            'not a Claude model id' => ['claude-sonnet-test', true],
        ];
    }

    #[DataProvider('forcedChoiceModels')]
    public function test_which_models_take_a_forced_tool_choice(string $model, bool $takes): void
    {
        $this->assertSame($takes, AnthropicSdk::takesForcedToolChoice($model));
    }
}
