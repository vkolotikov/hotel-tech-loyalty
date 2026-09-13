<?php

namespace Tests\Feature\VoiceAlexa;

use App\Models\VoiceAlexaLink;
use App\Voice\Alexa\AlexaAccountResolver;
use App\Voice\Alexa\PairedAlexaAccountResolver;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Voice\VoiceTestCase;

class AlexaAccountResolverTest extends VoiceTestCase
{
    private const ECHO_ACCOUNT = 'amzn1.ask.account.kitchen-echo';

    protected function setUp(): void
    {
        parent::setUp();

        VoiceAlexaLink::query()->create([
            'alexa_user_hash' => VoiceAlexaLink::hashFor(self::ECHO_ACCOUNT),
            'user_id' => $this->staff->id,
            'organization_id' => 1,
        ]);
    }

    private function payload(?string $userId = self::ECHO_ACCOUNT): array
    {
        return ['context' => ['System' => ['user' => array_filter(['userId' => $userId])]]];
    }

    private function resolve(array $payload): ?VoiceAlexaLink
    {
        return app(AlexaAccountResolver::class)->resolve($payload);
    }

    public function test_the_resolver_contract_is_bound_to_the_paired_implementation(): void
    {
        $this->assertInstanceOf(PairedAlexaAccountResolver::class, app(AlexaAccountResolver::class));
    }

    public function test_a_paired_account_resolves_to_its_link_and_staff_member(): void
    {
        $link = $this->resolve($this->payload());

        $this->assertNotNull($link);
        $this->assertSame((int) $this->staff->id, (int) $link->user->id);
    }

    public function test_session_user_id_is_used_when_context_is_absent(): void
    {
        $this->assertNotNull($this->resolve(['session' => ['user' => ['userId' => self::ECHO_ACCOUNT]]]));
    }

    public function test_an_unknown_or_missing_account_resolves_to_nobody(): void
    {
        $this->assertNull($this->resolve($this->payload('amzn1.ask.account.stranger')));
        $this->assertNull($this->resolve($this->payload(null)));
        $this->assertNull($this->resolve([]));
    }

    public function test_an_unlinked_echo_resolves_to_nobody(): void
    {
        VoiceAlexaLink::query()->update(['revoked_at' => now()]);

        $this->assertNull($this->resolve($this->payload()));
    }

    public function test_a_deactivated_staff_member_or_organization_resolves_to_nobody(): void
    {
        DB::table('staff')->update(['is_active' => false]);
        $this->assertNull($this->resolve($this->payload()));

        DB::table('staff')->update(['is_active' => true]);
        DB::table('organizations')->where('id', 1)->update(['is_active' => false]);
        $this->assertNull($this->resolve($this->payload()));
    }

    public function test_an_organization_outside_the_plugin_allowlist_resolves_to_nobody(): void
    {
        // Every voice tool runs CustomerBookingAccess::authorize(), which needs
        // the plugin allowlist as well. Refusing here keeps that failure early
        // and spoken instead of surfacing as a tool error mid-answer.
        config(['chatgpt.organization_ids' => []]);

        $this->assertNull($this->resolve($this->payload()));
    }
}
