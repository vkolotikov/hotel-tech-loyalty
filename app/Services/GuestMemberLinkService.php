<?php

namespace App\Services;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GuestMemberLinkService
{
    public function __construct(protected ?QrCodeService $qrCode = null) {}

    /**
     * Try to link a guest to a loyalty member by email match.
     * Called when a guest is created or updated.
     */
    public function linkGuestToMember(Guest $guest): bool
    {
        if ($guest->member_id) return false; // already linked

        $email = Guest::normalizeEmailKey($guest->email);
        if (!$email) return false;

        $user = User::where('email', $email)->where('user_type', 'member')->first();
        if (!$user) return false;

        $member = $user->loyaltyMember;
        if (!$member) return false;

        $guest->update([
            'member_id'   => $member->id,
            'loyalty_tier' => $member->tier?->name,
            'loyalty_id'  => $member->member_number,
        ]);

        return true;
    }

    /**
     * Ensure every guest with an email has a loyalty member at the lowest
     * tier (Bronze). If a member already exists for that email we just link;
     * otherwise we create the user + member in the same transaction. Called
     * after every Guest::create — booking widget, chatbot capture, manual
     * entry, importer — so the admin only ever needs to look at "Members"
     * to see the full set of people.
     */
    public function ensureMemberForGuest(Guest $guest): ?LoyaltyMember
    {
        // Already linked? Nothing to do.
        if ($guest->member_id) {
            return LoyaltyMember::find($guest->member_id);
        }

        $email = Guest::normalizeEmailKey($guest->email);
        if (!$email) return null;

        // Existing member for this email — reuse and link.
        $existingUser = User::where('email', $email)->first();
        if ($existingUser) {
            $member = $existingUser->loyaltyMember;
            if ($member) {
                $guest->update([
                    'member_id'    => $member->id,
                    'loyalty_tier' => $member->tier?->name,
                    'loyalty_id'   => $member->member_number,
                ]);
                return $member;
            }
            // User exists but no member yet — wrap them in a Bronze membership.
            return $this->createMembershipForUser($existingUser, $guest);
        }

        // No user yet — create user + Bronze member in one transaction.
        $name = trim($guest->full_name ?: trim(($guest->first_name ?? '') . ' ' . ($guest->last_name ?? '')));
        if ($name === '') $name = $email;

        $user = User::create([
            'name'            => $name,
            'email'           => $email,
            'password'        => bcrypt(Str::random(32)), // placeholder; user can request reset
            'phone'           => $guest->phone ?? $guest->mobile ?? null,
            'user_type'       => 'member',
            'organization_id' => $guest->organization_id,
        ]);

        return $this->createMembershipForUser($user, $guest);
    }

    /**
     * Create a Bronze (lowest-tier) LoyaltyMember row for a user and link
     * the originating guest to it. Safe to call inside a try/catch — caller
     * decides whether to fail loudly.
     */
    protected function createMembershipForUser(User $user, Guest $guest): ?LoyaltyMember
    {
        $tier = LoyaltyTier::where('name', 'Bronze')->first()
            ?? LoyaltyTier::orderBy('min_points')->first();
        if (!$tier) return null; // no tiers seeded — bail silently

        $memberNumber = $this->qrCode?->generateMemberNumber() ?? ('M' . strtoupper(Str::random(8)));
        $referralCode = $this->qrCode?->generateReferralCode() ?? strtoupper(Str::random(8));

        $member = LoyaltyMember::create([
            'organization_id' => $guest->organization_id,
            'user_id'         => $user->id,
            'tier_id'         => $tier->id,
            'member_number'   => $memberNumber,
            'qr_code_token'   => Str::random(64),
            'referral_code'   => $referralCode,
            'lifetime_points' => 0,
            'current_points'  => 0,
            'is_active'       => true,
            'joined_at'       => now(),
        ]);

        $guest->update([
            'member_id'    => $member->id,
            'loyalty_tier' => $tier->name,
            'loyalty_id'   => $member->member_number,
        ]);

        return $member;
    }

    /**
     * The one guest that represents this member, for the portal booking
     * flow to attach a reservation to. Prefers a guest already linked by
     * member_id; otherwise reuses a guest with the member's email (linking
     * it); otherwise creates a new one.
     *
     * The new guest is created with member_id already set, so
     * Guest::created's auto-Bronze hook (which only fires when
     * `$guest->member_id` is empty — see Guest::booted()) sees an
     * already-linked guest and never calls ensureMemberForGuest() again.
     * This is what keeps a member from ever picking up a second
     * membership through this path.
     */
    public function ensureGuestForMember(LoyaltyMember $member): Guest
    {
        $orgId = (int) $member->organization_id;

        $linked = Guest::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('member_id', $member->id)
            ->orderBy('id')
            ->first();
        if ($linked) return $linked;

        $email = strtolower(trim((string) $member->user?->email));
        if ($email !== '') {
            $byEmail = Guest::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereRaw('LOWER(email) = ?', [$email])
                ->orderBy('id')
                ->first();
            if ($byEmail) {
                $byEmail->forceFill(['member_id' => $member->id])->save();
                return $byEmail;
            }
        }

        // Clamped to the real column lengths (2026_03_28_100001_create_crm_tables):
        // `users.name` and `users.email` are longer, and PostgreSQL refuses an
        // over-long value — an overlong name used to fail the member's confirm.
        return Guest::withoutGlobalScopes()->create([
            'organization_id' => $orgId,
            'member_id'       => $member->id,
            'first_name'      => $this->clamp($this->firstName($member), 100),
            'last_name'       => $this->clamp($this->lastName($member), 100),
            // `guests.full_name` is NOT NULL on PostgreSQL; without it every portal
            // confirm by a member with no guest row yet failed (Task 21 browser pass).
            'full_name'       => $this->clamp(trim((string) $member->user?->name) ?: ($email ?: 'Member'), 200),
            'email'           => $this->clamp($email ?: null, 150),
            'phone'           => $this->clamp($member->user?->phone, 50),
            'lead_source'     => 'Member Portal',
        ]);
    }

    private function clamp(?string $value, int $length): ?string
    {
        return $value === null ? null : mb_substr($value, 0, $length);
    }

    /** The member user's name, split on the first space. */
    protected function firstName(LoyaltyMember $member): ?string
    {
        $name = trim((string) $member->user?->name);
        if ($name === '') return null;
        return Str::before($name, ' ');
    }

    /** The member user's name, split on the first space; null when there is no remainder. */
    protected function lastName(LoyaltyMember $member): ?string
    {
        $name = trim((string) $member->user?->name);
        if ($name === '' || !str_contains($name, ' ')) return null;
        return Str::after($name, ' ');
    }

    /**
     * Try to link existing guests to a newly created member by email match.
     * Called when a member registers or is created by admin.
     */
    public function linkMemberToGuests(LoyaltyMember $member): int
    {
        $user = $member->user;
        if (!$user || !$user->email) return 0;

        $emailKey = Guest::normalizeEmailKey($user->email);
        if (!$emailKey) return 0;

        $count = Guest::whereNull('member_id')
            ->where('email_key', $emailKey)
            ->update([
                'member_id'   => $member->id,
                'loyalty_tier' => $member->tier?->name,
                'loyalty_id'  => $member->member_number,
            ]);

        return $count;
    }

    /**
     * Backfill: link all unlinked guests that have matching member emails,
     * AND create Bronze memberships for guests with email but no member.
     */
    public function backfillAll(bool $createMissing = true): array
    {
        $linked  = 0;
        $created = 0;

        $unlinkedGuests = Guest::whereNull('member_id')
            ->whereNotNull('email_key')
            ->where('email_key', '!=', '')
            ->get();

        $checked = $unlinkedGuests->count();

        $membersByEmail = User::where('user_type', 'member')
            ->whereHas('loyaltyMember')
            ->with('loyaltyMember.tier')
            ->get()
            ->keyBy(fn($u) => strtolower(trim($u->email)));

        foreach ($unlinkedGuests as $guest) {
            $user = $membersByEmail->get($guest->email_key);
            if ($user && $user->loyaltyMember) {
                $guest->update([
                    'member_id'    => $user->loyaltyMember->id,
                    'loyalty_tier' => $user->loyaltyMember->tier?->name,
                    'loyalty_id'   => $user->loyaltyMember->member_number,
                ]);
                $linked++;
                continue;
            }

            if ($createMissing) {
                try {
                    if ($this->ensureMemberForGuest($guest)) $created++;
                } catch (\Throwable $e) {
                    \Log::warning('backfill ensureMemberForGuest failed', [
                        'guest_id' => $guest->id, 'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        return ['checked' => $checked, 'linked' => $linked, 'created' => $created];
    }
}
