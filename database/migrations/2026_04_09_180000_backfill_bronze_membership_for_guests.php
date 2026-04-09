<?php

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Backfill: every existing guest with an email gets a Bronze loyalty
 * membership so the unified "Members" view in the admin covers the full
 * contact list. Idempotent — re-runs skip guests that already have member_id.
 *
 * Done as a raw migration (not via the service) so we don't depend on Laravel
 * service container state during early boot.
 */
return new class extends Migration {
    public function up(): void
    {
        $orgs = DB::table('organizations')->pluck('id');

        foreach ($orgs as $orgId) {
            $bronze = LoyaltyTier::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('name', 'Bronze')
                ->first()
                ?? LoyaltyTier::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->orderBy('min_points')
                    ->first();
            if (!$bronze) continue;

            $guests = Guest::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereNull('member_id')
                ->whereNotNull('email')
                ->where('email', '!=', '')
                ->get();

            foreach ($guests as $guest) {
                $email = strtolower(trim($guest->email));
                if (!$email) continue;

                // Reuse existing user if one exists for this email.
                $user = User::where('email', $email)->first();
                if (!$user) {
                    $name = trim($guest->full_name ?: trim(($guest->first_name ?? '') . ' ' . ($guest->last_name ?? '')));
                    if ($name === '') $name = $email;

                    $user = User::create([
                        'name'            => $name,
                        'email'           => $email,
                        'password'        => bcrypt(Str::random(32)),
                        'phone'           => $guest->phone ?? $guest->mobile ?? null,
                        'user_type'       => 'member',
                        'organization_id' => $orgId,
                    ]);
                }

                $member = $user->loyaltyMember;
                if (!$member) {
                    $member = LoyaltyMember::create([
                        'organization_id' => $orgId,
                        'user_id'         => $user->id,
                        'tier_id'         => $bronze->id,
                        'member_number'   => 'M' . strtoupper(Str::random(8)),
                        'qr_code_token'   => Str::random(64),
                        'referral_code'   => strtoupper(Str::random(8)),
                        'lifetime_points' => 0,
                        'current_points'  => 0,
                        'is_active'       => true,
                        'joined_at'       => now(),
                    ]);
                }

                $guest->update([
                    'member_id'    => $member->id,
                    'loyalty_tier' => $bronze->name,
                    'loyalty_id'   => $member->member_number,
                ]);
            }
        }
    }

    public function down(): void
    {
        // Non-reversible data backfill.
    }
};
