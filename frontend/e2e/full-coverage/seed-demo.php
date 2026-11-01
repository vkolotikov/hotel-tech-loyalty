<?php

/*
 * Demo data for the full-coverage screenshots (README.md beside this file).
 *
 *   php8.5 frontend/e2e/full-coverage/seed-demo.php        (from the repository root)
 *
 * Runs against the database in the repository's own .env, and only when APP_ENV is local and the database
 * name contains "demo": it never touches a real one. Run it once on a database freshly built from every
 * migration, then keep that database as a template and copy it before every screenshot run, so every run
 * sees the same rows (a run signs in, and sign-ins and page visits write audit and activity rows).
 *
 * What it writes, all through the application's own code where there is one:
 *   - one hotel organisation, set up the way the setup wizard does it (OrganizationSetupService::
 *     onboardWithIndustry with sample data: tiers, benefits, a property, sample members, guests, offers);
 *   - database/seeders/DatabaseSeeder (tiers, benefits, the demo staff and members with stays, offers,
 *     hotel settings). That seeder predates per-organisation users, so its users are given the
 *     organisation afterwards (a staff user without one cannot sign in);
 *   - a few rows for the screens the seeders leave empty: rooms and stays in the booking mirror,
 *     inquiries, services with a team member and appointments, a chat conversation, a loyalty event (through
 *     EventEditor), a draft loyalty email campaign, a content profile with posts, and a landing page (through
 *     POST /api/v1/admin/landing-pages, which seeds its sections).
 * With FC_SERVER_NOW set (fixed-now.php), every date it writes is counted from that instant.
 * No credentials are written here or printed: the demo users' passwords are the seeders' own.
 */

use App\Models\Organization;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$root = dirname(__DIR__, 3);
require $root . '/vendor/autoload.php';
// FC_SERVER_NOW, as for the screenshot server: the demo rows are dated from that instant (optional).
require __DIR__ . '/fixed-now.php';
$app = require $root . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$database = (string) config('database.connections.' . config('database.default') . '.database');
if (app()->environment() !== 'local' || !str_contains($database, 'demo')) {
    fwrite(STDERR, "seed-demo: refusing (APP_ENV must be local and the database name must contain \"demo\").\n");
    exit(2);
}
// The migrations create one organisation ("My Hotel", on a starter trial); a seeded database has staff.
$org = Organization::query()->orderBy('id')->first();
if (!$org || DB::table('staff')->exists()) {
    fwrite(STDERR, "seed-demo: run it once, on a database freshly built from every migration.\n");
    exit(2);
}

$say = fn (string $line) => fwrite(STDOUT, $line . "\n");

// A paying organisation with every feature, so no screen is behind a plan gate. The dates are fixed so the
// template database behaves the same whenever it is copied (a trial would expire a week after seeding).
$org->update([
    'name'                => 'Grand Hotel',
    'slug'                => 'grand-hotel',
    'industry'            => 'hotel',
    'currency'            => 'EUR',
    'timezone'            => 'Europe/London',
    'is_active'           => true,
    'plan_slug'           => 'enterprise',
    'subscription_status' => 'ACTIVE',
    'trial_end'           => null,
    'period_end'          => '2030-01-01 00:00:00',
    'entitled_products'   => ['crm', 'chat', 'loyalty', 'education', 'avatar', 'booking'],
    'plan_features'       => [
        'max_team_members' => 'unlimited', 'max_guests' => 'unlimited', 'max_properties' => 'unlimited',
        'max_loyalty_members' => 'unlimited', 'ai_insights' => 'true', 'ai_avatars' => 'true',
        'custom_branding' => 'true', 'api_access' => 'true', 'push_notifications' => 'true', 'mobile_app' => 'true',
        'nfc_cards' => 'true', 'priority_support' => 'dedicated', 'time_management' => 'true', 'admin_ai' => 'true',
        'brands' => 'true', 'campaigns' => 'true', 'reviews' => 'true', 'engagement' => 'true', 'wallet' => 'true',
        'chatbot' => 'true', 'landing_pages' => 'true',
    ],
]);
app()->instance('current_organization_id', $org->id);

$result = app(App\Services\OrganizationSetupService::class)->onboardWithIndustry($org, [
    'company_name'     => 'Grand Hotel',
    'industry'         => 'hotel',
    'features'         => ['ai_chat', 'loyalty', 'bookings', 'crm', 'operations'],
    'welcome_message'  => 'Welcome to the Grand Hotel. How can we help?',
    'with_sample_data' => true,
]);
$say('onboarding: ' . json_encode($result['steps']) . ($result['errors'] ? ' errors: ' . implode('; ', $result['errors']) : ''));

Artisan::call('db:seed', ['--force' => true]);
$say(trim(preg_replace('/^.*(Login Credentials|Admin:|User:|Member:).*$/m', '', Artisan::output())));

// The demo seeder's users carry no organisation (written before users had one).
DB::table('users')->whereNull('organization_id')->update(['organization_id' => $org->id]);

// ── Rows for screens the seeders leave empty ─────────────────────────────────────────────────────────
$now = now()->startOfDay()->addHours(10);
$step = function (string $what, callable $write) use ($say) {
    try {
        DB::transaction($write);
        $say("✓ $what");
    } catch (Throwable $e) {
        $say("✗ $what: " . strtok($e->getMessage(), "\n"));
    }
};

$step('booking mirror: rooms and stays', function () use ($org, $now) {
    $rooms = [];
    foreach ([['Deluxe Double', 180], ['Junior Suite', 260], ['Garden Room', 140]] as $i => [$name, $price]) {
        $rooms[] = Database\Factories\BookingRoomFactory::new()->create([
            'organization_id' => $org->id, 'name' => $name, 'base_price' => $price, 'sort_order' => $i,
        ]);
    }
    $guests = ['Alice Johnson', 'Bob Martinez', 'Carol Smith', 'Daniel Brown', 'Eva Novak', 'Farah Khan'];
    foreach ($guests as $i => $guest) {
        $arrival = $now->copy()->addDays($i * 2 - 4);
        Database\Factories\BookingMirrorFactory::new()->create([
            'organization_id' => $org->id,
            'apartment_id'    => $rooms[$i % 3]->pms_id,
            'apartment_name'  => $rooms[$i % 3]->name,
            'guest_name'      => $guest,
            'arrival_date'    => $arrival->toDateString(),
            'departure_date'  => $arrival->copy()->addDays(2 + $i % 3)->toDateString(),
            'price_total'     => 300 + $i * 85,
        ]);
    }
});

$step('inquiries', function () use ($org, $now) {
    $guests = App\Models\Guest::withoutGlobalScopes()->where('organization_id', $org->id)->orderBy('id')->take(5)->get();
    $pipeline = DB::table('pipelines')->where('organization_id', $org->id)->orderBy('id')->first();
    $stages = $pipeline ? DB::table('pipeline_stages')->where('pipeline_id', $pipeline->id)->orderBy('sort_order')->get()->values() : collect();
    foreach ($guests as $i => $guest) {
        $stage = $stages[$i % max(1, $stages->count())] ?? null;
        App\Models\Inquiry::create([
            'pipeline_id'     => $pipeline?->id,
            'pipeline_stage_id' => $stage?->id,
            'guest_id'        => $guest->id,
            'inquiry_type'    => 'room_reservation',
            'source'          => ['website', 'email', 'phone', 'walk_in', 'referral'][$i],
            'check_in'        => $now->copy()->addDays(10 + $i * 7)->toDateString(),
            'check_out'       => $now->copy()->addDays(13 + $i * 7)->toDateString(),
            'num_rooms'       => 1 + $i % 2,
            'num_adults'      => 2,
            'room_type_requested' => ['Deluxe Double', 'Junior Suite', 'Garden Room'][$i % 3],
            'total_value'     => 600 + $i * 240,
            'status'          => $stage?->name ?? 'New',
            'priority'        => ['low', 'medium', 'high', 'medium', 'high'][$i],
            'notes'           => 'Demo inquiry ' . ($i + 1),
        ]);
    }
});

$step('services, a team member and appointments', function () use ($org, $now) {
    $category = Schema::hasTable('service_categories')
        ? App\Models\ServiceCategory::create(['name' => 'Spa', 'slug' => 'spa', 'is_active' => true, 'sort_order' => 0])
        : null;
    $services = [];
    foreach ([['Swedish massage', 60, 85], ['Facial', 45, 70], ['Hot stone therapy', 90, 120]] as $i => [$name, $minutes, $price]) {
        $services[] = App\Models\Service::create(array_filter([
            'category_id'      => $category?->id,
            'name'             => $name,
            'slug'             => Illuminate\Support\Str::slug($name),
            'duration_minutes' => $minutes,
            'price'            => $price,
            'currency'         => 'EUR',
            'is_active'        => true,
            'sort_order'       => $i,
        ], fn ($v) => $v !== null));
    }
    $master = App\Models\ServiceMaster::create([
        'name' => 'Maria Lopez', 'title' => 'Senior therapist', 'is_active' => true, 'sort_order' => 0,
    ]);
    $master->services()->sync(collect($services)->mapWithKeys(fn ($s) => [$s->id => ['organization_id' => $org->id]])->all());
    foreach ([[0, 0, 'confirmed'], [1, 2, 'confirmed'], [2, 4, 'pending'], [0, 26, 'completed']] as $i => [$s, $hours, $status]) {
        $service = $services[$s];
        $start = $now->copy()->addHours($hours);
        if ($hours >= 24) $start = $now->copy()->subDay()->addHours(1);
        App\Models\ServiceBooking::create([
            'booking_reference' => 'SB-DEMO' . ($i + 1),
            'service_id'        => $service->id,
            'service_master_id' => $master->id,
            'customer_name'     => ['Alice Johnson', 'Bob Martinez', 'Carol Smith', 'David Lee'][$i],
            'customer_email'    => ['alice', 'bob', 'carol', 'david'][$i] . '@demo.com',
            'start_at'          => $start,
            'end_at'            => $start->copy()->addMinutes($service->duration_minutes),
            'duration_minutes'  => $service->duration_minutes,
            'party_size'        => 1,
            'service_price'     => $service->price,
            'total_amount'      => $service->price,
            'currency'          => 'EUR',
            'status'            => $status,
            'payment_status'    => 'unpaid',
            'source'            => 'admin',
        ]);
    }
});

$step('a chat conversation', function () use ($now) {
    $visitor = App\Models\Visitor::create([
        'visitor_key' => 'demo-visitor-1', 'display_name' => 'Website visitor', 'country' => 'United Kingdom',
        'city' => 'London', 'first_seen_at' => $now->copy()->subMinutes(30), 'last_seen_at' => $now,
        'visit_count' => 2, 'page_views_count' => 5,
    ]);
    $conversation = App\Models\ChatConversation::create([
        'visitor_id' => $visitor->id, 'session_id' => 'demo-session-1', 'visitor_name' => 'Emma Wilson',
        'visitor_email' => 'emma@demo.com', 'status' => 'active', 'channel' => 'widget',
        'last_message_at' => $now, 'messages_count' => 2,
    ]);
    foreach ([['visitor', 'Hello, do you have a room free next weekend?'], ['ai', 'Yes, we have a Deluxe Double and a Junior Suite free. Shall I check prices?']] as [$sender, $text]) {
        App\Models\ChatMessage::create([
            'conversation_id' => $conversation->id, 'sender_type' => $sender, 'content' => $text,
        ]);
    }
});

$step('a loyalty event', function () use ($org, $now) {
    $by = App\Models\User::where('user_type', 'staff')->where('organization_id', $org->id)->orderBy('id')->firstOrFail();
    app(App\Services\Loyalty\Events\EventEditor::class)->create($org->id, [
        'title'       => 'Wine tasting evening',
        'description' => 'An evening with our sommelier.',
        'starts_at'   => $now->copy()->addDays(5)->setTime(19, 0)->format('Y-m-d\\TH:i'),
        'ends_at'     => $now->copy()->addDays(5)->setTime(21, 0)->format('Y-m-d\\TH:i'),
        'location'    => 'Wine cellar',
        'capacity'    => 20,
        'points'      => 100,
    ], $by, true);
});

$step('a draft loyalty email campaign', function () use ($org) {
    $by = App\Models\User::where('user_type', 'staff')->where('organization_id', $org->id)->orderBy('id')->firstOrFail();
    App\Models\EmailCampaign::create([
        'name' => 'November newsletter', 'subject' => 'Autumn at the Grand Hotel', 'body_html' => '', 'body_blocks' => [],
        'status' => App\Models\EmailCampaign::STATUS_DRAFT, 'created_by_user_id' => $by->id,
    ]);
});

$step('a content profile and posts', function () use ($org, $now) {
    $brandId = DB::table('brands')->where('organization_id', $org->id)->orderBy('id')->value('id');
    $by = App\Models\User::where('user_type', 'staff')->where('organization_id', $org->id)->orderBy('id')->firstOrFail();
    $profile = App\Models\ContentPlannerProfile::create([
        'brand_id' => $brandId, 'name' => 'Grand Hotel', 'default_language' => 'en', 'default_tone' => 'warm',
        'primary_goal' => 'bookings', 'setup_completed_at' => $now, 'created_by' => $by->id,
    ]);
    $posts = [
        ['instagram', 0, 'approved', 'Autumn afternoon tea', 'Join us for afternoon tea by the fire this weekend.'],
        ['facebook', 1, 'draft', 'Spa week', 'Our spa week starts on Monday: two treatments for the price of one.'],
        ['linkedin', 3, 'needs_review', 'Meetings at the Grand', 'Plan your next team day in our new meeting rooms.'],
        ['instagram', 5, 'idea', 'Wine tasting evening', 'An evening with our sommelier in the wine cellar.'],
    ];
    foreach ($posts as [$platform, $day, $status, $title, $copy]) {
        App\Models\ContentPlannerPost::create([
            'brand_id' => $brandId, 'planner_profile_id' => $profile->id, 'platform' => $platform,
            'scheduled_date' => $now->copy()->addDays($day)->toDateString(), 'scheduled_time' => '10:00',
            'language' => 'en', 'title' => $title, 'topic' => $title, 'main_copy' => $copy, 'status' => $status,
            'generated_by' => 'manual', 'created_by' => $by->id,
        ]);
    }
});

// The landing page through its own API, as the editor's first save makes it (the controller seeds its sections).
$step('a landing page', function () use ($org) {
    $admin = App\Models\User::where('user_type', 'staff')->where('organization_id', $org->id)->orderBy('id')->firstOrFail();
    $token = $admin->createToken('seed-demo')->plainTextToken;
    $request = Illuminate\Http\Request::create('/api/v1/admin/landing-pages', 'POST', [], [], [], [
        'HTTP_AUTHORIZATION' => 'Bearer ' . $token, 'HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json',
    ], json_encode(['slug' => 'grand-hotel', 'template_key' => 'northline_retreat']));
    $response = app(Illuminate\Contracts\Http\Kernel::class)->handle($request);
    $admin->tokens()->delete();
    if ($response->getStatusCode() >= 300) {
        throw new RuntimeException('POST landing-pages answered ' . $response->getStatusCode() . ': ' . substr((string) $response->getContent(), 0, 200));
    }
});

$say('demo organisation id ' . $org->id . ' ready');
