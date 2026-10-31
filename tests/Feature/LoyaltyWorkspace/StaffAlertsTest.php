<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\BenefitDefinition;
use App\Models\Reward;
use App\Models\StaffDevice;
use App\Models\TierBenefit;
use App\Models\User;
use App\Services\Loyalty\Staff\StaffAlerts;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Request alerts on the HexaTech Staff app's phones (owner 2026-10-31): a phone registers and leaves, a member's
 * benefit request reaches every active staff phone, a claimed reward only those who may hand it over, each in the
 * phone's language; never while the workspace is off; a phone Expo calls gone is forgotten; Expo's trouble never
 * fails the member's request.
 */
class StaffAlertsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private const MEMBER_REQUEST = '/api/v1/member/benefits/%d/request';
    private const MEMBER_REDEEM = '/api/v1/member/rewards/%d/redeem';

    private TierBenefit $drink;
    private Reward $coffee;
    /** What the fake Expo answers (swapped per test: a later Http::fake() does not replace an earlier one). */
    private \Closure $expo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        if (!Schema::hasTable('staff_devices')) {
            (require database_path('migrations/2026_10_31_120000_create_staff_devices.php'))->up();
        }

        $benefit = BenefitDefinition::create(['name' => 'Welcome drink', 'code' => 'drink', 'category' => 'dining', 'fulfillment_mode' => 'on_request']);
        $this->drink = TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $benefit->id, 'is_active' => true]);
        $this->coffee = Reward::create(['name' => 'Free coffee', 'points_cost' => 100, 'is_active' => true]);

        Http::preventStrayRequests();
        $this->expo = fn (HttpRequest $r) => Http::response(['data' => array_fill(0, count($r->data()), ['status' => 'ok', 'id' => 'ticket'])], 200);
        Http::fake(['exp.host/*' => fn (HttpRequest $r) => ($this->expo)($r)]);
    }

    private static function token(string $name): string
    {
        return "ExponentPushToken[{$name}-0000000000]";
    }

    /** A phone as the app registers it, then aged or switched as a test needs. */
    private function phone(User $user, string $name, array $fields = [], array $after = []): StaffDevice
    {
        $this->actingAs($user, 'sanctum')->putJson($this->api('devices'), ['token' => self::token($name), 'platform' => 'ios'] + $fields)->assertOk();
        $device = StaffDevice::query()->where('token', self::token($name))->firstOrFail();
        if ($after !== []) {
            $device->forceFill($after)->save();
        }

        return $device;
    }

    /** @return list<array<string, mixed>> every push Expo was handed, in order */
    private function pushes(): array
    {
        return Http::recorded(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://exp.host/'))
            ->flatMap(fn ($pair) => json_decode($pair[0]->body(), true))->values()->all();
    }

    public function test_a_phone_is_registered_moved_to_whoever_signs_in_and_removed_only_by_its_person(): void
    {
        $this->asStaffMember()->putJson($this->api('devices'), ['token' => self::token('desk'), 'platform' => 'android', 'language' => 'ru'])
            ->assertOk()->assertExactJson(['device' => ['alerts' => true, 'language' => 'ru']]);
        $row = StaffDevice::query()->where('token', self::token('desk'))->firstOrFail();
        $this->assertSame([(int) $this->org->id, (int) $this->staffMember->id, StaffAlerts::APP, 'android'], [(int) $row->organization_id, (int) $row->user_id, $row->app, $row->platform]);

        // The desk phone handed over: the manager signs in on it.
        $this->asManager()->putJson($this->api('devices'), ['token' => self::token('desk')])->assertOk();
        $this->assertSame(1, StaffDevice::query()->where('token', self::token('desk'))->count());
        $this->assertSame((int) $this->manager->id, (int) StaffDevice::query()->where('token', self::token('desk'))->value('user_id'));

        $this->asStaffMember()->deleteJson($this->api('devices'), ['token' => self::token('desk')])->assertOk()->assertExactJson(['removed' => false]);
        $this->asManager()->deleteJson($this->api('devices'), ['token' => self::token('desk')])->assertOk()->assertExactJson(['removed' => true]);
        $this->assertSame(0, StaffDevice::query()->count());

        $this->asStaffMember()->putJson($this->api('devices'), ['token' => 'not-a-token'])->assertStatus(422)->assertJsonValidationErrors(['token']);
        $this->asStaffMember()->putJson($this->api('devices'), ['token' => self::token('x'), 'language' => 'it'])->assertStatus(422)->assertJsonValidationErrors(['language']);
    }

    public function test_language_and_the_switch_change_only_when_sent(): void
    {
        $this->phone($this->staffMember, 'mine', ['language' => 'de', 'alerts' => false]);
        $this->travel(2)->days();
        $this->asStaffMember()->putJson($this->api('devices'), ['token' => self::token('mine')])->assertOk()->assertExactJson(['device' => ['alerts' => false, 'language' => 'de']]);

        $row = StaffDevice::query()->where('token', self::token('mine'))->firstOrFail();
        $this->assertTrue($row->last_seen_at->isSameDay(now()));
    }

    public function test_a_benefit_request_alerts_every_active_staff_phone_in_its_language(): void
    {
        $this->phone($this->staffMember, 'staff', ['language' => 'ru']);
        $this->phone($this->manager, 'manager', ['language' => 'en']);
        $this->phone($this->manager, 'quiet', ['alerts' => false]);
        $this->phone($this->staffMember, 'old', [], ['last_seen_at' => now()->subDays(StaffAlerts::STALE_DAYS + 1)]);
        $gone = $this->staffUser($this->org, ['role' => 'staff']);
        $this->phone($gone, 'left');
        \App\Models\Staff::query()->where('user_id', $gone->id)->update(['is_active' => false]);

        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REQUEST, $this->drink->id))->assertCreated();

        $pushes = collect($this->pushes())->keyBy('to');
        $this->assertEqualsCanonicalizing([self::token('staff'), self::token('manager')], $pushes->keys()->all());
        $this->assertSame('Новый запрос', $pushes[self::token('staff')]['title']);
        $this->assertSame('Ada Lovelace просит: Welcome drink', $pushes[self::token('staff')]['body']);
        $this->assertSame('Ada Lovelace asks for Welcome drink', $pushes[self::token('manager')]['body']);
        $request = \App\Models\BenefitEntitlement::query()->latest('id')->firstOrFail();
        $this->assertEquals(['type' => StaffAlerts::TYPE, 'kind' => 'benefit', 'id' => $request->id, 'organization_id' => $this->org->id], $pushes[self::token('manager')]['data']);
    }

    public function test_a_claimed_reward_alerts_only_those_who_may_hand_it_over(): void
    {
        $this->phone($this->manager, 'manager');
        $this->phone($this->staffMember, 'redeemer');
        $desk = $this->staffUser($this->org, ['role' => 'staff', 'can_redeem_points' => false]);
        $this->phone($desk, 'desk');

        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REDEEM, $this->coffee->id))->assertCreated();

        $pushes = collect($this->pushes());
        $this->assertEqualsCanonicalizing([self::token('manager'), self::token('redeemer')], $pushes->pluck('to')->all());
        $this->assertSame('Ada Lovelace claimed Free coffee', $pushes->first()['body']);
        $this->assertSame('reward', $pushes->first()['data']['kind']);
    }

    public function test_another_organisations_phones_hear_nothing(): void
    {
        $other = $this->otherOrganization();
        $theirs = $this->staffUser($other['org'], ['role' => 'staff']);
        StaffDevice::query()->create(['organization_id' => $other['org']->id, 'user_id' => $theirs->id, 'app' => StaffAlerts::APP, 'token' => self::token('theirs'), 'last_seen_at' => now()]);
        $this->phone($this->staffMember, 'ours');

        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REQUEST, $this->drink->id))->assertCreated();

        $this->assertSame([self::token('ours')], array_column($this->pushes(), 'to'));
    }

    public function test_no_alert_while_the_loyalty_workspace_is_off(): void
    {
        $this->phone($this->staffMember, 'staff');
        $this->org->setWorkspace('loyalty', false);
        $this->org->save();

        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REQUEST, $this->drink->id))->assertCreated();

        $this->assertSame([], $this->pushes());
    }

    public function test_a_phone_expo_calls_gone_is_forgotten(): void
    {
        $this->phone($this->staffMember, 'gone');
        $this->phone($this->manager, 'here');
        $this->expo = fn (HttpRequest $r) => Http::response(['data' => array_map(
            fn (array $m) => str_contains($m['to'], 'gone') ? ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']] : ['status' => 'ok', 'id' => 't'],
            $r->data(),
        )], 200);

        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REQUEST, $this->drink->id))->assertCreated();

        $this->assertSame([self::token('here')], StaffDevice::query()->pluck('token')->all());
    }

    public function test_a_request_is_alerted_at_most_once(): void
    {
        $this->phone($this->staffMember, 'staff');
        $request = \App\Models\BenefitEntitlement::create(['member_id' => $this->ada->id, 'benefit_id' => $this->drink->benefit_id, 'status' => 'pending', 'requested_at' => now()]);
        $alerts = app(StaffAlerts::class);

        $this->assertSame(1, $alerts->benefitRequested((int) $this->org->id, (int) $request->id));
        $this->assertSame(0, $alerts->benefitRequested((int) $this->org->id, (int) $request->id));
        $this->assertCount(1, $this->pushes());
    }

    public function test_expo_down_never_fails_the_members_request(): void
    {
        $this->phone($this->staffMember, 'staff');
        $this->expo = fn () => Http::response('upstream down', 503);

        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REQUEST, $this->drink->id))->assertCreated();
        $this->actingAs($this->ada->user, 'sanctum')->postJson(sprintf(self::MEMBER_REDEEM, $this->coffee->id))->assertCreated();

        $this->assertCount(2, $this->pushes());
        $this->assertSame(1, StaffDevice::query()->count());
    }
}
