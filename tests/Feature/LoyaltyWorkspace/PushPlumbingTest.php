<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Services\LoyaltyService;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * How pushes leave (2026-11-04): with the platform's Expo access token set, every send carries it (Expo refuses a
 * project's pushes without it once "Enhanced push security" is on); a tier notice goes only after the write that moved
 * the member has committed, never from inside it, and never for one that rolled back.
 */
class PushPlumbingTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_every_push_carries_the_expo_access_token_when_one_is_set(): void
    {
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok', 'id' => 'ticket']]], 200)]);
        $message = ['to' => 'ExponentPushToken[plumbing-0000000000]', 'title' => 'Hello', 'body' => 'World'];

        config(['services.expo.access_token' => '']);
        app(NotificationService::class)->pushMany([$message]);
        config(['services.expo.access_token' => 'expo-test-token-not-real']);
        app(NotificationService::class)->pushMany([$message]);

        $sent = Http::recorded()->map(fn ($pair) => $pair[0])->values();
        $this->assertCount(2, $sent);
        $this->assertFalse($sent[0]->hasHeader('Authorization'));
        $this->assertTrue($sent[1]->hasHeader('Authorization', 'Bearer expo-test-token-not-real'));
        $this->assertTrue($sent->every(fn (HttpRequest $r) => $r->url() === 'https://exp.host/--/api/v2/push/send'));
    }

    public function test_a_tier_notice_waits_for_the_commit_and_never_follows_a_rollback(): void
    {
        $notices = $this->spy(NotificationService::class);
        $loyalty = app(LoyaltyService::class);

        try {
            DB::transaction(function () use ($loyalty) {
                $loyalty->awardPoints($this->grace, 900, 'Rolled back', 'earn');
                throw new \RuntimeException('the write fails after the tier moved');
            });
        } catch (\RuntimeException) {
        }
        $notices->shouldNotHaveReceived('sendTierUpgradeNotification');
        $this->assertSame($this->tiers['silver']->id, (int) $this->grace->fresh()->tier_id);

        $loyalty->awardPoints($this->grace->fresh(), 900, 'Kept', 'earn');
        $this->assertSame($this->tiers['gold']->id, (int) $this->grace->fresh()->tier_id);
        $notices->shouldHaveReceived('sendTierUpgradeNotification')->once();
    }
}
