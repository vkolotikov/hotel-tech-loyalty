<?php
// Presentation fixtures only in the guarded, disposable launch database. Never accepts a customer id.
$app = require __DIR__.'/launch-app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$fixture = json_decode(file_get_contents(getenv('LAUNCH_FIXTURE')), true, flags: JSON_THROW_ON_ERROR);
$stateFile = getenv('LAUNCH_OUTPUT').'/portal-design/private-state.json';
$state = json_decode(file_get_contents($stateFile), true, flags: JSON_THROW_ON_ERROR);
$user = App\Models\User::withoutGlobalScopes()->whereKey($state['user']['id'])->where('organization_id', $fixture['org_id'])->where('email', 'like', 'portal.%@example.test')->sole();
$member = App\Models\LoyaltyMember::withoutGlobalScopes()->where('user_id', $user->id)->sole();
$orgId = (int) $fixture['org_id'];
app()->instance('current_organization_id', $orgId);
$service = App\Models\Service::withoutGlobalScopes()->where('organization_id', $orgId)->first()
    ?? App\Models\Service::create(['organization_id' => $orgId, 'name' => 'Wellness appointment', 'duration_minutes' => 60, 'price' => 50, 'is_active' => true]);
foreach (['future' => ['2026-11-22 11:00:00', 'confirmed'], 'past' => ['2026-11-05 11:00:00', 'completed']] as $key => [$date, $status]) {
    if (!App\Models\ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)->where('booking_reference', 'PORTAL-DESIGN-'.$key)->exists()) {
        App\Models\ServiceBooking::create(['organization_id' => $orgId, 'member_id' => $member->id, 'service_id' => $service->id,
            'booking_reference' => 'PORTAL-DESIGN-'.$key, 'customer_name' => $user->name, 'customer_email' => $user->email,
            'start_at' => $date, 'end_at' => substr($date, 0, 11).'12:00:00', 'duration_minutes' => 60,
            'service_price' => 50, 'total_amount' => 50, 'currency' => 'EUR', 'party_size' => 1,
            'status' => $status, 'payment_status' => 'unpaid', 'source' => 'portal']);
    }
}
foreach (['Club lounge' => 'all', 'Private terrace' => 'tiers'] as $name => $admits) {
    if (!App\Models\AccessPlace::query()->where('name', $name)->exists()) {
        $place = new App\Models\AccessPlace();
        $place->forceFill(['organization_id' => $orgId, 'name' => $name, 'admits' => $admits, 'is_active' => true])->save();
    }
}
echo "Local member presentation fixtures prepared.\n";
