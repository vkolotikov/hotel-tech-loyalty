<?php

namespace Tests\Feature\VoiceAlexa;

use App\Models\VoiceAlexaLink;
use App\Voice\Alexa\AlexaPairing;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Voice\VoiceTestCase;

class AlexaSkillEndpointTest extends VoiceTestCase
{
    private const PATH = '/api/v1/voice/alexa';

    private const SKILL = 'amzn1.ask.skill.hexatech-test';

    private const ECHO_ACCOUNT = 'amzn1.ask.account.kitchen-echo';

    private string $caFile;

    protected function setUp(): void
    {
        parent::setUp();

        // The test certificates are minted with the real clock; the shared
        // voice fixtures travel back a day, which would make every signed
        // request "not yet valid" before the code under test ever ran.
        $this->travelBack();

        // The skill endpoint must establish identity and tenant context itself.
        // Leaving the fixture's acting user bound would hide a controller that
        // forgot to.
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('current_organization_id');

        $this->caFile = tempnam(sys_get_temp_dir(), 'alexa-ca');
        file_put_contents($this->caFile, AlexaCertificates::set()['rootPem']);

        config([
            'voice.alexa' => ['enabled' => true, 'skill_ids' => [self::SKILL], 'ca_bundle' => $this->caFile,
                'timestamp_tolerance_seconds' => 150, 'certificate_cache_seconds' => 3600,
                'pairing_ttl_seconds' => 600],
            'openai.api_key' => 'test-key',
        ]);

        // Without a SaaS link, the organization's own record decides access,
        // exactly as for the ChatGPT connection.
        DB::table('organizations')->where('id', 1)->update(['subscription_status' => 'ACTIVE']);
    }

    protected function tearDown(): void
    {
        @unlink($this->caFile);
        parent::tearDown();
    }

    /** Registers every fake once: earlier Http::fake stubs win, so no re-faking. */
    private function fake(array ...$modelReplies): void
    {
        $model = Http::sequence();
        foreach ($modelReplies as $reply) {
            $model->push($reply, 200);
        }

        Http::fake([
            AlexaCertificates::CERT_URL => Http::response(AlexaCertificates::set()['leafPem'], 200),
            // An unexpected model call gets a server error, which surfaces as
            // the spoken apology and fails whatever the test expected instead.
            'api.openai.com/*' => $modelReplies === [] ? Http::response(['error' => 'unexpected'], 500) : $model,
        ]);
    }

    private function alexa(array $request): TestResponse
    {
        $body = json_encode([
            'version' => '1.0',
            'session' => ['new' => false, 'sessionId' => 'amzn1.echo-api.session.kitchen',
                'application' => ['applicationId' => self::SKILL], 'user' => ['userId' => self::ECHO_ACCOUNT]],
            'context' => ['System' => ['application' => ['applicationId' => self::SKILL],
                'user' => ['userId' => self::ECHO_ACCOUNT]]],
            'request' => array_merge(['requestId' => 'amzn1.echo-api.request.'.uniqid(),
                'timestamp' => now()->utc()->format('Y-m-d\TH:i:s\Z'), 'locale' => 'en-GB'], $request),
        ]);

        return $this->call('POST', self::PATH, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_SIGNATURECERTCHAINURL' => AlexaCertificates::CERT_URL,
            'HTTP_SIGNATURE_256' => AlexaCertificates::sign($body, AlexaCertificates::set()['leafKey']),
        ], $body);
    }

    private function intent(string $name, array $slots = []): array
    {
        return ['type' => 'IntentRequest', 'intent' => ['name' => $name,
            'slots' => array_map(fn ($value) => ['value' => $value], $slots)]];
    }

    private function speech(TestResponse $response): string
    {
        $response->assertOk();

        return (string) $response->json('response.outputSpeech.text');
    }

    private function link(bool $canWrite = false): VoiceAlexaLink
    {
        return VoiceAlexaLink::query()->create(['alexa_user_hash' => VoiceAlexaLink::hashFor(self::ECHO_ACCOUNT),
            'user_id' => $this->staff->id, 'organization_id' => 1, 'can_write' => $canWrite, 'linked_at' => now()]);
    }

    private function toolCall(string $name, array $arguments): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => null,
            'tool_calls' => [['id' => 'call_1', 'type' => 'function', 'function' => [
                'name' => $name, 'arguments' => json_encode($arguments)]]]]]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    private function finalAnswer(string $text): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    public function test_an_unsigned_request_is_rejected(): void
    {
        $this->fake();

        $this->postJson(self::PATH, ['request' => ['type' => 'LaunchRequest']])->assertStatus(400);
    }

    public function test_an_unlinked_echo_is_told_how_to_pair(): void
    {
        $this->fake();

        $response = $this->alexa(['type' => 'LaunchRequest']);
        $text = $this->speech($response);

        $this->assertStringContainsString('Connected apps', $text);
        $this->assertStringContainsString('link code', $text);
        $this->assertFalse($response->json('response.shouldEndSession'));
    }

    public function test_a_linked_echo_is_greeted_and_the_session_stays_open(): void
    {
        $this->fake();
        $this->link();

        $response = $this->alexa(['type' => 'LaunchRequest']);

        $this->assertStringContainsString('Hexa-Tech is ready', $this->speech($response));
        $this->assertFalse($response->json('response.shouldEndSession'));
    }

    public function test_pairing_then_asking_answers_through_the_gateway(): void
    {
        $this->fake($this->toolCall('voice_lead_count', []), $this->finalAnswer('You have two leads today.'));
        $code = app(AlexaPairing::class)->issue($this->staff);

        $paired = $this->speech($this->alexa($this->intent('PairIntent', ['code' => $code])));
        $this->assertStringContainsString('now linked', $paired);

        $answer = $this->speech($this->alexa($this->intent('AskIntent', ['query' => 'how many leads today'])));

        $this->assertSame('You have two leads today.', $answer);
        $this->assertNotNull(VoiceAlexaLink::query()->value('last_used_at'));
    }

    public function test_a_wrong_code_is_spoken_and_links_nothing(): void
    {
        $this->fake();
        app(AlexaPairing::class)->issue($this->staff);

        $text = $this->speech($this->alexa($this->intent('PairIntent', ['code' => '000000'])));

        $this->assertStringContainsString("didn't work", $text);
        $this->assertSame(0, VoiceAlexaLink::query()->count());
    }

    public function test_a_lapsed_subscription_is_spoken_and_the_model_is_never_called(): void
    {
        $this->fake();
        $this->link();
        DB::table('organizations')->where('id', 1)->update(['subscription_status' => 'CANCELED']);

        $text = $this->speech($this->alexa($this->intent('AskIntent', ['query' => 'how many leads today'])));

        $this->assertStringContainsString("subscription isn't active", $text);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'api.openai.com'));
    }

    public function test_an_organization_without_voice_access_is_spoken(): void
    {
        $this->fake();
        $this->link();
        config(['voice.organization_ids' => []]);

        $text = $this->speech($this->alexa($this->intent('AskIntent', ['query' => 'how many leads today'])));

        $this->assertStringContainsString('not enabled', $text);
    }

    public function test_a_read_only_echo_is_not_offered_note_tools_but_an_allowed_one_is(): void
    {
        $this->fake($this->finalAnswer('Fine.'), $this->finalAnswer('Fine.'));
        $link = $this->link();

        $this->alexa($this->intent('AskIntent', ['query' => 'what is today']))->assertOk();
        $link->forceFill(['can_write' => true])->save();
        $this->alexa($this->intent('AskIntent', ['query' => 'what is today']))->assertOk();

        $offered = Http::recorded()
            ->filter(fn ($pair) => str_contains($pair[0]->url(), 'api.openai.com'))
            ->map(fn ($pair) => array_column(array_column($pair[0]->data()['tools'], 'function'), 'name'))
            ->values();

        $this->assertCount(2, $offered);
        $this->assertNotContains('voice_propose_note', $offered[0]);
        $this->assertContains('voice_propose_note', $offered[1]);
    }

    public function test_a_model_failure_is_spoken_instead_of_an_error(): void
    {
        $this->fake();
        $this->link();

        $text = $this->speech($this->alexa($this->intent('AskIntent', ['query' => 'how many leads today'])));

        $this->assertStringContainsString("couldn't reach Hexa-Tech", $text);
    }

    public function test_stopping_ends_the_session_and_a_session_end_gets_an_empty_body(): void
    {
        $this->fake();
        $this->link();

        $this->assertTrue($this->alexa($this->intent('AMAZON.StopIntent'))->json('response.shouldEndSession'));

        $ended = $this->alexa(['type' => 'SessionEndedRequest', 'reason' => 'USER_INITIATED']);
        $ended->assertOk();
        $this->assertSame('{"version":"1.0","response":{}}', $ended->getContent());
    }

    public function test_a_disabled_skill_says_so_and_ends_the_session(): void
    {
        $this->fake();
        config(['voice.alexa.enabled' => false]);

        $response = $this->alexa(['type' => 'LaunchRequest']);

        $this->assertStringContainsString("isn't available", $this->speech($response));
        $this->assertTrue($response->json('response.shouldEndSession'));
    }

    public function test_every_verified_request_is_logged_without_what_was_said(): void
    {
        // A pilot device that "doesn't answer" is undiagnosable without knowing
        // which request type and intent Alexa actually sent, and why Amazon
        // ended a session. What the person said is never logged, only its length.
        $this->fake();
        $this->link();
        \Illuminate\Support\Facades\Log::spy();

        $this->alexa($this->intent('AMAZON.FallbackIntent'))->assertOk();
        $this->alexa(['type' => 'SessionEndedRequest', 'reason' => 'ERROR',
            'error' => ['type' => 'INVALID_RESPONSE', 'message' => 'x']])->assertOk();
        $this->alexa($this->intent('AskIntent', ['query' => 'Morgan Lee private details']))->assertOk();

        $logged = [];
        \Illuminate\Support\Facades\Log::shouldHaveReceived('notice')->withArgs(
            function (string $message, array $context = []) use (&$logged) {
                if ($message === 'Alexa skill request') {
                    $logged[] = $context;
                }

                return true;
            });

        $this->assertSame(['IntentRequest', 'SessionEndedRequest', 'IntentRequest'], array_column($logged, 'type'));
        $this->assertSame('AMAZON.FallbackIntent', $logged[0]['intent']);
        $this->assertSame(['ERROR', 'INVALID_RESPONSE'], [$logged[1]['reason'], $logged[1]['error']]);
        $this->assertSame(26, $logged[2]['query_chars']);
        $this->assertIsInt($logged[2]['duration_ms']);
        $this->assertStringNotContainsString('Morgan', json_encode($logged));
    }

    public function test_a_rejected_request_is_logged_with_its_reason_and_skill_id(): void
    {
        // Amazon only ever sees a 400. Without the reason in the log, a wrong
        // skill id or an untrusted certificate chain cannot be told apart.
        $this->fake();
        \Illuminate\Support\Facades\Log::spy();

        $body = json_encode(['context' => ['System' => ['application' => ['applicationId' => 'amzn1.ask.skill.typo']]],
            'request' => ['type' => 'LaunchRequest']]);
        $this->call('POST', self::PATH, [], [], [], ['CONTENT_TYPE' => 'application/json'], $body)->assertStatus(400);

        // Warning, not notice: deployments commonly run LOG_LEVEL=error or
        // warning, and a filtered diagnostic is no diagnostic at all.
        \Illuminate\Support\Facades\Log::shouldHaveReceived('warning')->once()->withArgs(
            fn (string $message, array $context = []) => $message === 'Alexa skill request rejected'
                && str_contains($context['reason'] ?? '', 'not an Alexa URL')
                && ($context['skill_id'] ?? null) === 'amzn1.ask.skill.typo');
    }
}
