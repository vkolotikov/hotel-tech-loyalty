<?php

namespace App\Services\Loyalty\Members;

use App\Mail\WelcomeMemberMail;
use App\Models\AuditLog;
use App\Models\EmailVerificationCode;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use App\Services\AnalyticsService;
use App\Services\GuestMemberLinkService;
use App\Services\Loyalty\Cards\NfcCards;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\LoyaltyService;
use App\Services\PlanLimitGuard;
use App\Services\QrCodeService;
use App\Services\RealtimeEventService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Enrolling a member and sending the welcome email again: the one writer the full admin's Members
 * (`MemberAdminController@store`, `@resendWelcomeEmail`) and HexaTech Loyalty's Add member and Resend call
 * (spec 2026-10-21 release 2 §4.3). Moved here unchanged from the controller, which keeps its own answers.
 *
 * Enrolment, in one transaction: the member's user (a member of this organisation), the membership on the requested
 * tier or the default one (Bronze, else the lowest), the static QR token, an NFC card when one is named, the welcome
 * bonus through the ledger (so a failure rolls everything back) and, without a password, a 48-hour code for the
 * welcome email's "set your password". After it, never a reason to fail: the welcome email (sent at once, and
 * `welcomed_at` stamped), the CRM guests with the same email linked, the realtime event, the audit row.
 *
 * Quirks kept on purpose, because the full admin's answer depends on them: the welcome bonus re-assesses the tier, so
 * a chosen starting tier above the bonus's is undone (the workspace offers no choice); the QR token is written as a
 * random string, then the HMAC token (a named card no longer replaces it, release 6).
 */
final class MemberEnrolment
{
    /** How long the welcome email's code is good for. */
    public const CODE_HOURS = 48;

    public function __construct(
        private readonly LoyaltyService $loyalty,
        private readonly QrCodeService $qrCode,
        private readonly GuestMemberLinkService $links,
        private readonly RealtimeEventService $realtime,
    ) {
    }

    /**
     * @param array{name: string, email: string, password?: ?string, phone?: ?string, tier_id?: ?int, nfc_uid?: ?string} $data
     * @return array{member: LoyaltyMember, tier: LoyaltyTier, invite_flow: bool, email_sent: bool}
     *
     * @throws LoyaltyRefused `member_limit` (402, the plan's sentence as its message) or `no_tier` (422)
     */
    public function enrol(array $data, User $by, ?bool $sendWelcome = null): array
    {
        // The plan's member cap (max_loyalty_members).
        if ($block = app(PlanLimitGuard::class)->check(PlanLimitGuard::KEY_MEMBERS)) {
            throw new LoyaltyRefused('member_limit', $block, 402);
        }

        $tier = !empty($data['tier_id'])
            ? LoyaltyTier::find($data['tier_id'])
            : (LoyaltyTier::where('name', 'Bronze')->first() ?? LoyaltyTier::orderBy('min_points')->first());
        if (!$tier) {
            throw new LoyaltyRefused('no_tier', 'No loyalty tiers configured for this organization.', 422);
        }

        $inviteFlow = empty($data['password']);
        $welcomeBonus = (int) HotelSetting::getValue('welcome_bonus_points', 500);
        $sendEmail = $sendWelcome ?? $inviteFlow;

        [$member, $inviteCode] = DB::transaction(function () use ($data, $by, $tier, $inviteFlow, $welcomeBonus) {
            $user = User::create([
                'name'      => $data['name'],
                'email'     => $data['email'],
                // A random password when none is given: the member sets their own with the welcome email's code.
                'password'  => Hash::make($data['password'] ?? Str::random(40)),
                'phone'     => $data['phone'] ?? null,
                'user_type' => 'member',
                // Required: TenantScope fails closed, so a member user without an organisation signs in to nothing.
                'organization_id' => $by->organization_id
                    ?? (app()->bound('current_organization_id') ? app('current_organization_id') : null),
            ]);

            $member = LoyaltyMember::create([
                'user_id'         => $user->id,
                'tier_id'         => $tier->id,
                'member_number'   => $this->qrCode->generateMemberNumber(),
                'qr_code_token'   => Str::random(64),
                'referral_code'   => $this->qrCode->generateReferralCode(),
                'lifetime_points' => 0,
                'current_points'  => 0,
                'is_active'       => true,
                'joined_at'       => now(),
            ]);

            $this->qrCode->generateToken($member);

            if (!empty($data['nfc_uid'])) {
                // Through NfcCards (release 6): the ID stored normalised, one card for one member across every
                // organisation (a refusal rolls the whole enrolment back), and the member's QR code and wallet pass
                // stay their own — the card's ID no longer replaces the QR token.
                app(NfcCards::class)->link($member, (string) $data['nfc_uid'], $by, 'NTAG213', 'enrolment');
            }

            // Inside the transaction: a failed bonus leaves no member without one.
            if ($welcomeBonus > 0) {
                $this->loyalty->awardPoints($member, $welcomeBonus, 'Welcome bonus — registered by staff', 'bonus', $by);
            }

            return [$member, $inviteFlow ? $this->newCode($user->email) : null];
        });

        $emailSent = false;
        if ($sendEmail && $inviteCode) {
            try {
                $this->mail($member->load(['user', 'tier']), $inviteCode);
                $emailSent = true;
                // Booking and service flows read this and do not welcome the member a second time.
                $member->forceFill(['welcomed_at' => now()])->save();
            } catch (\Throwable $e) {
                Log::warning('Welcome email send failed', ['member_id' => $member->id, 'error' => $e->getMessage()]);
            }
        }

        try {
            $this->links->linkMemberToGuests($member);
        } catch (\Throwable $e) {
            Log::warning('linkMemberToGuests failed', ['member_id' => $member->id, 'error' => $e->getMessage()]);
        }

        try {
            $this->realtime->dispatch('member', 'New Member Registered', "{$member->user->name} joined as {$tier->name}",
                ['id' => $member->id, 'name' => $member->user->name, 'tier' => $tier->name]);
        } catch (\Throwable $e) {
            Log::warning('Realtime dispatch failed', ['error' => $e->getMessage()]);
        }

        try {
            AuditLog::record('member_created', $member,
                ['name' => $member->user->name, 'email' => $member->user->email, 'tier' => $tier->name],
                [], $by, "Member '{$member->user->name}' created");
        } catch (\Throwable $e) {
            Log::warning('AuditLog::record failed', ['error' => $e->getMessage()]);
        }

        try {
            AnalyticsService::clearDashboardCache();
        } catch (\Throwable) {
        }

        return ['member' => $member, 'tier' => $tier, 'invite_flow' => $inviteFlow, 'email_sent' => $emailSent];
    }

    /**
     * The welcome email again, with a fresh 48-hour code in place of any open one. The email goes out synchronously.
     *
     * @return string the address it went to
     * @throws LoyaltyRefused `no_email` (422) when the member has no email on file
     * @throws WelcomeNotSent when the mail server did not take it (the new code is kept)
     */
    public function resendWelcome(LoyaltyMember $member): string
    {
        $member->loadMissing(['user', 'tier']);
        if (!$member->user || !$member->user->email) {
            throw new LoyaltyRefused('no_email', 'Member has no email on file', 422);
        }

        $code = $this->newCode($member->user->email);

        try {
            $this->mail($member, $code);
        } catch (\Throwable $e) {
            Log::error('Welcome email resend failed', ['member_id' => $member->id, 'error' => $e->getMessage()]);
            throw new WelcomeNotSent($e);
        }

        return $member->user->email;
    }

    /** A fresh six-digit code for the address, every unused one before it removed. */
    private function newCode(string $email): string
    {
        EmailVerificationCode::where('email', $email)->whereNull('verified_at')->delete();

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        EmailVerificationCode::create(['email' => $email, 'code' => $code, 'expires_at' => now()->addHours(self::CODE_HOURS)]);

        return $code;
    }

    private function mail(LoyaltyMember $member, string $code): void
    {
        $org = Organization::find($member->organization_id);
        Mail::to($member->user->email)->send(new WelcomeMemberMail($member, $org, $code));
    }
}
