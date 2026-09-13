<?php

namespace Tests\Feature\VoiceAlexa;

use App\Models\VoiceAlexaLink;
use App\Voice\Alexa\AlexaAccountResolver;
use App\Voice\Alexa\AlexaPairing;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Voice\VoiceTestCase;

class VoiceAlexaLinkEndpointTest extends VoiceTestCase
{
    private const BASE = '/api/v1/auth/voice-alexa';

    private const ECHO_ACCOUNT = 'amzn1.ask.account.kitchen-echo';

    protected function setUp(): void
    {
        parent::setUp();
        config(['voice.alexa.enabled' => true]);

        // Class names, not aliases: withoutMiddleware() matches on the class.
        $this->withoutMiddleware([
            \App\Http\Middleware\SaasAuthMiddleware::class,
            \App\Http\Middleware\TenantMiddleware::class,
            \App\Http\Middleware\AdminMiddleware::class,
        ]);
    }

    private function linkFor(int $userId, string $account, array $attributes = []): VoiceAlexaLink
    {
        return VoiceAlexaLink::query()->create(array_merge([
            'alexa_user_hash' => VoiceAlexaLink::hashFor($account), 'user_id' => $userId,
            'organization_id' => 1, 'linked_at' => now(),
        ], $attributes));
    }

    private function colleague(): int
    {
        DB::table('users')->insert(['id' => 2, 'organization_id' => 1,
            'email' => 'second@example.test', 'name' => 'Second', 'user_type' => 'staff']);
        DB::table('staff')->insert(['user_id' => 2, 'organization_id' => 1]);

        return 2;
    }

    public function test_a_pairing_code_is_issued_for_a_voice_enabled_workspace_and_links_the_caller(): void
    {
        $response = $this->postJson(self::BASE.'/pairing-code')->assertOk();

        $this->assertMatchesRegularExpression('/\A\d{6}\z/', $response->json('code'));
        $this->assertSame(600, $response->json('expires_in'));

        $link = app(AlexaPairing::class)->claim(self::ECHO_ACCOUNT, $response->json('code'));
        $this->assertSame((int) $this->staff->id, (int) $link->user_id);
    }

    public function test_no_code_is_issued_without_voice_access_or_with_alexa_off(): void
    {
        config(['voice.organization_ids' => []]);
        $this->postJson(self::BASE.'/pairing-code')->assertForbidden();

        config(['voice.organization_ids' => [1], 'voice.alexa.enabled' => false]);
        $this->postJson(self::BASE.'/pairing-code')->assertForbidden();
    }

    public function test_the_list_shows_only_the_callers_live_links_and_never_amazon_identifiers(): void
    {
        $own = $this->linkFor((int) $this->staff->id, self::ECHO_ACCOUNT);
        $this->linkFor((int) $this->staff->id, 'amzn1.ask.account.old-echo', ['revoked_at' => now()]);
        $this->linkFor($this->colleague(), 'amzn1.ask.account.colleague-echo');

        $response = $this->getJson(self::BASE.'/links')->assertOk();

        $this->assertTrue($response->json('enabled'));
        $this->assertSame([$own->id], array_column($response->json('links'), 'id'));
        $this->assertStringNotContainsString($own->alexa_user_hash, $response->getContent());
        $this->assertStringNotContainsString('alexa_user_hash', $response->getContent());
    }

    public function test_the_list_reports_when_linking_is_unavailable(): void
    {
        config(['voice.organization_ids' => []]);

        $this->getJson(self::BASE.'/links')->assertOk()->assertJsonPath('enabled', false);
    }

    public function test_another_persons_link_can_be_neither_changed_nor_removed(): void
    {
        $own = $this->linkFor((int) $this->staff->id, self::ECHO_ACCOUNT);
        $theirs = $this->linkFor($this->colleague(), 'amzn1.ask.account.colleague-echo');

        // The same request succeeds on the caller's own link, so the 404s below
        // come from the ownership check. A missing route is also a 404, and this
        // test passed vacuously before the endpoint existed.
        $this->patchJson(self::BASE.'/links/'.$own->id, ['can_write' => false])->assertOk();

        $this->patchJson(self::BASE.'/links/'.$theirs->id, ['can_write' => true])->assertNotFound();
        $this->deleteJson(self::BASE.'/links/'.$theirs->id)->assertNotFound();

        $this->assertFalse($theirs->fresh()->can_write);
        $this->assertNull($theirs->fresh()->revoked_at);
    }

    public function test_allowing_notes_and_unlinking_take_effect_immediately(): void
    {
        $link = $this->linkFor((int) $this->staff->id, self::ECHO_ACCOUNT);
        $payload = ['context' => ['System' => ['user' => ['userId' => self::ECHO_ACCOUNT]]]];

        $this->patchJson(self::BASE.'/links/'.$link->id, ['can_write' => true])
            ->assertOk()->assertJsonPath('link.can_write', true);
        $this->assertTrue($link->fresh()->can_write);

        $this->deleteJson(self::BASE.'/links/'.$link->id)->assertNoContent();

        $this->assertNotNull($link->fresh()->revoked_at);
        $this->assertFalse($link->fresh()->can_write);
        $this->assertNull(app(AlexaAccountResolver::class)->resolve($payload));
    }

    public function test_unlinking_still_works_when_voice_is_turned_off(): void
    {
        $link = $this->linkFor((int) $this->staff->id, self::ECHO_ACCOUNT);
        config(['voice.organization_ids' => [], 'voice.alexa.enabled' => false]);

        $this->deleteJson(self::BASE.'/links/'.$link->id)->assertNoContent();
    }

    public function test_changing_notes_permission_requires_a_boolean(): void
    {
        $link = $this->linkFor((int) $this->staff->id, self::ECHO_ACCOUNT);

        $this->patchJson(self::BASE.'/links/'.$link->id, [])->assertStatus(422);
        $this->patchJson(self::BASE.'/links/'.$link->id, ['can_write' => 'maybe'])->assertStatus(422);
    }
}
