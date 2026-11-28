<?php

// Seed only the separately migrated, loopback rehearsal database. Never print generated credentials.
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use App\Services\OrganizationSetupService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

$root = dirname(__DIR__, 2);
$app = require __DIR__ . '/launch-app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

if (!app()->environment('local') || config('database.default') !== 'pgsql'
    || config('database.connections.pgsql.database') !== 'loyalty_launch_demo'
    || config('database.connections.pgsql.host') !== '127.0.0.1'
    || (string) config('database.connections.pgsql.port') !== '55459'
    || config('mail.default') !== 'log' || config('queue.default') !== 'database') {
    fwrite(STDERR, "Refused: the isolated local PostgreSQL demo, captured mail and database queue are required.\n");
    exit(2);
}
$fixtureFile = getenv('LAUNCH_FIXTURE');
$fixtureDir = $fixtureFile ? realpath(dirname($fixtureFile)) : false;
if (!$fixtureDir || str_starts_with(strtolower(str_replace('\\', '/', $fixtureDir)) . '/', strtolower(str_replace('\\', '/', $root)) . '/')) {
    fwrite(STDERR, "LAUNCH_FIXTURE must be outside the repository, in an existing directory.\n"); exit(2);
}
if (DB::table('staff')->exists() || file_exists($fixtureFile)) {
    fwrite(STDERR, "Already seeded: use a new isolated database and private fixture file.\n"); exit(2);
}
$org = Organization::query()->firstOrFail();
$org->update([
    'name' => 'Launch Test Hotel', 'slug' => 'loyalty-launch-test-hotel', 'industry' => 'hotel',
    'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true, 'plan_slug' => 'enterprise',
    'subscription_status' => 'ACTIVE', 'trial_end' => null, 'period_end' => '2030-01-01 00:00:00',
    'entitled_products' => ['loyalty', 'booking', 'crm', 'chat'],
    'plan_features' => ['max_team_members' => 'unlimited', 'max_loyalty_members' => 'unlimited',
        'max_guests' => 'unlimited', 'brands' => 'true', 'campaigns' => 'true', 'wallet' => 'true',
        'push_notifications' => 'true', 'mobile_app' => 'true', 'nfc_cards' => 'true', 'custom_branding' => 'true'],
]);
app()->instance('current_organization_id', $org->id);
Brand::query()->where('is_default', true)->update(['name' => $org->name]);
$setup = app(OrganizationSetupService::class)->onboardWithIndustry($org, [
    'company_name' => $org->name, 'industry' => 'hotel', 'features' => ['loyalty'], 'with_sample_data' => false,
]);
if ($setup['errors']) { fwrite(STDERR, "Rehearsal onboarding failed; inspect the isolated application log.\n"); exit(1); }
$roles = [];
foreach (['manager', 'desk', 'reader'] as $role) {
    $password = Str::random(36);
    $email = "launch.$role@example.test";
    $user = User::create(['organization_id' => $org->id, 'name' => 'Launch ' . ucfirst($role), 'email' => $email,
        'password' => Hash::make($password), 'email_verified_at' => now(), 'user_type' => 'staff', 'is_active' => true]);
    Staff::create(['organization_id' => $org->id, 'user_id' => $user->id, 'role' => $role === 'manager' ? 'manager' : 'staff',
        'hotel_name' => $org->name, 'can_award_points' => $role !== 'reader', 'can_redeem_points' => $role !== 'reader',
        'can_manage_offers' => $role === 'manager', 'can_view_analytics' => $role === 'manager', 'is_active' => true]);
    $roles[$role] = ['email' => $email, 'password' => $password];
}
$fixture = ['org_id' => $org->id, 'org_token' => $org->fresh()->widget_token, 'roles' => $roles,
    'member' => ['email' => 'launch.member@example.test', 'password' => Str::random(36), 'name' => 'Launch Test Member']];
file_put_contents($fixtureFile, json_encode($fixture, JSON_THROW_ON_ERROR));
echo json_encode(['seeded' => true, 'staff_accounts' => count($roles), 'onboarding_steps' => $setup['steps']], JSON_THROW_ON_ERROR) . PHP_EOL;
