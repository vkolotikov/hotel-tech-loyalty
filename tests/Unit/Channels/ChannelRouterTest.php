<?php

namespace Tests\Unit\Channels;

use App\Models\ChatChannelAccount;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Services\Channels\ChannelDispatcher;
use App\Services\Channels\ChannelRouter;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * Locks ChannelRouter::for() + ::register() — the routing layer
 * that decides which dispatcher (if any) handles a conversation's
 * outbound message (Chat Phase 2 ship).
 *
 * Why this matters:
 *
 *   Web-widget conversations get internal handling — the visitor's
 *   browser polls, no external API call. External channels
 *   (Messenger today; WhatsApp + Instagram later) need their
 *   dispatcher's Send API. for() makes the decision.
 *
 *   A routing regression has two failure modes, both bad:
 *
 *   1. Treating an external channel as internal → the admin's
 *      reply silently never reaches the customer's Messenger inbox.
 *      The admin sees their message saved locally but the customer
 *      hears crickets.
 *
 *   2. Treating an internal channel as external → an outbound
 *      API call against a nonexistent dispatcher / wrong endpoint.
 *      Wastes credentials, surfaces auth errors, no real harm but
 *      pollutes ops dashboards.
 *
 * Contract:
 *
 *   - channel='widget'  → return null (internal)
 *   - channel='web'     → return null (internal alias)
 *   - channel='mobile'  → return null (internal)
 *   - channel=''        → return null (legacy / unknown defaults internal)
 *   - channel=null      → return null
 *   - channel='messenger' → return the MessengerDispatcher
 *   - channel='whatsapp' (not registered yet) → return null (safe
 *     default — caller skips external send rather than crashing)
 *
 * register(dispatcher) MUST:
 *   - Key by the dispatcher's channel() id
 *   - Allow re-registration to swap implementations (used in tests
 *     + the future hot-reload story for credential rotation)
 *
 * Pure-function test — no DB / no boot.
 */
class ChannelRouterTest extends TestCase
{
    /** Build a dispatcher mock that reports a specific channel id. */
    private function mockDispatcher(string $channel): ChannelDispatcher
    {
        $m = Mockery::mock(ChannelDispatcher::class);
        $m->shouldReceive('channel')->andReturn($channel);
        return $m;
    }

    /** Build a router pre-registered with a messenger mock. */
    private function routerWithMessenger(): array
    {
        $messenger = $this->mockDispatcher('messenger');

        // The constructor takes a concrete MessengerDispatcher class;
        // sidestep by constructing the router without the constructor
        // and registering the mock manually. ReflectionClass keeps the
        // test free of the production MessengerDispatcher's heavy
        // dependencies.
        $router = (new \ReflectionClass(ChannelRouter::class))->newInstanceWithoutConstructor();
        $router->register($messenger);

        return [$router, $messenger];
    }

    private function conversation(?string $channel): ChatConversation
    {
        // Unsaved model — for() reads only the channel attribute.
        $c = new ChatConversation();
        $c->channel = $channel;
        return $c;
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /* ─── Internal channels return null (no external send) ─── */

    public function test_widget_channel_returns_null(): void
    {
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation('widget')),
            'widget channel MUST resolve to null (no external send).');
    }

    public function test_web_channel_alias_returns_null(): void
    {
        // 'web' is the legacy alias for 'widget' — same internal
        // treatment.
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation('web')));
    }

    public function test_mobile_channel_returns_null(): void
    {
        // Native mobile app conversations are also internal.
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation('mobile')));
    }

    public function test_empty_string_channel_returns_null(): void
    {
        // Defensive: a conversation row with channel='' (legacy data,
        // partial migration) MUST default to internal — sending to
        // an empty external channel would crash or 401.
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation('')));
    }

    public function test_null_channel_returns_null(): void
    {
        // The schema allows NULL on `channel`. Pre-fix this would
        // throw on the string cast; the implementation coalesces
        // to '' which resolves null.
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation(null)));
    }

    /* ─── External channels return the registered dispatcher ─── */

    public function test_messenger_channel_returns_registered_dispatcher(): void
    {
        // CRITICAL: this is the happy path. A regression that
        // returned null for 'messenger' would silently swallow every
        // outbound message — the admin sees their reply saved
        // locally but the visitor never gets it.
        [$router, $messenger] = $this->routerWithMessenger();

        $resolved = $router->for($this->conversation('messenger'));

        $this->assertSame($messenger, $resolved,
            'messenger channel MUST resolve to the registered MessengerDispatcher.');
    }

    public function test_unregistered_external_channel_returns_null(): void
    {
        // 'whatsapp' / 'instagram' / 'tiktok' — channels that exist
        // as concepts but don't have a dispatcher yet. Returning
        // null is safer than throwing: the caller's sendOutbound
        // (which returns bool) gracefully skips, log surfaces the
        // miss, and ops can react without a service outage.
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation('whatsapp')),
            'Unregistered external channel MUST return null (safe skip, not throw).');
    }

    public function test_unknown_channel_string_returns_null(): void
    {
        // A typo / future channel ('sms', 'voice', 'rcs') that
        // hasn't been registered MUST NOT crash. Same safe-skip
        // semantic.
        [$router] = $this->routerWithMessenger();

        $this->assertNull($router->for($this->conversation('rcs')));
    }

    /* ─── register() — runtime dispatcher registration ─── */

    public function test_register_adds_a_dispatcher_for_a_new_channel(): void
    {
        // The router's constructor injects MessengerDispatcher; the
        // register() method lets future channels add themselves.
        // Verify the contract.
        $router = (new \ReflectionClass(ChannelRouter::class))->newInstanceWithoutConstructor();
        $whatsapp = $this->mockDispatcher('whatsapp');

        $router->register($whatsapp);

        $this->assertSame($whatsapp,
            $router->for($this->conversation('whatsapp')),
            'register() MUST add the dispatcher under its channel() id.');
    }

    public function test_register_re_registration_swaps_the_dispatcher(): void
    {
        // Future hot-reload story: rotate credentials → swap a
        // dispatcher instance without restarting. Lock the swap.
        $router = (new \ReflectionClass(ChannelRouter::class))->newInstanceWithoutConstructor();

        $old = $this->mockDispatcher('messenger');
        $new = $this->mockDispatcher('messenger');

        $router->register($old);
        $router->register($new);

        $this->assertSame($new,
            $router->for($this->conversation('messenger')),
            'Re-registering the same channel MUST swap the dispatcher to the latest.');
    }

    public function test_register_multiple_dispatchers_coexist_by_channel(): void
    {
        // Lock independence: registering Messenger then WhatsApp
        // MUST NOT clobber Messenger.
        $router = (new \ReflectionClass(ChannelRouter::class))->newInstanceWithoutConstructor();

        $messenger = $this->mockDispatcher('messenger');
        $whatsapp  = $this->mockDispatcher('whatsapp');

        $router->register($messenger);
        $router->register($whatsapp);

        $this->assertSame($messenger,
            $router->for($this->conversation('messenger')));
        $this->assertSame($whatsapp,
            $router->for($this->conversation('whatsapp')));
    }

    /* ─── Channel id resolution uses dispatcher's own ::channel() ─── */

    public function test_register_uses_the_dispatchers_own_channel_id(): void
    {
        // The router calls $dispatcher->channel() — the dispatcher
        // owns the keying. A regression that hardcoded 'messenger'
        // for ALL dispatchers would silently route everything to
        // the wrong adapter.
        $router = (new \ReflectionClass(ChannelRouter::class))->newInstanceWithoutConstructor();
        $fake = $this->mockDispatcher('custom_test_channel');

        $router->register($fake);

        $this->assertSame($fake,
            $router->for($this->conversation('custom_test_channel')));
        $this->assertNull(
            $router->for($this->conversation('messenger')),
            'Registering a dispatcher with id "X" MUST NOT make it answer for other channels.');
    }
}
