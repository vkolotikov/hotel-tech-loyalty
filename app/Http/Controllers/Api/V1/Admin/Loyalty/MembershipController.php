<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberCard;
use App\Services\Loyalty\Members\MemberDetails;
use App\Services\Loyalty\Members\MemberEnrolment;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\MemberProfile;
use App\Services\Loyalty\Members\MemberStatus;
use App\Services\Loyalty\Members\OwnAccount;
use App\Services\Loyalty\Members\WelcomeNotSent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * A member's account in HexaTech Loyalty (spec 2026-10-21 release 2 §4.1, §4.2): Add member, Edit details, the card
 * and the welcome email for every staff member; Change tier, Deactivate / Reactivate and Delete for a manager. The
 * writing is the shared services' (MemberEnrolment, MemberDetails, MemberStatus, MemberErasure), which the full
 * admin's Members calls too; the rules are LoyaltyAccess's, checked here (the access map only records outside
 * `enforce`). Every member a route names is read through the tenant scope (404 `not_found`); every change answers
 * with the member as their page shows them (MemberProfile).
 *
 * A deleted member (MemberErasure::isErased) keeps only their number and history: their details, tier, account,
 * card and welcome email are refused (`already_erased`, 409).
 */
class MembershipController extends Controller
{
    /** Resend the welcome email at most once per member in this many seconds. */
    public const WELCOME_EVERY = 600;

    private const EMAIL_UNAVAILABLE = 'This email is unavailable for a new loyalty account.';

    public function store(Request $request, MemberEnrolment $enrolment): JsonResponse
    {
        $data = $request->validate([
            'name'         => 'required|string|max:255',
            'email'        => 'required|email|max:255',
            'phone'        => 'nullable|string|max:20',
            'send_welcome' => 'sometimes|boolean',
            'physical_card_id' => ['required_with:physical_card_uid', 'integer', OwnRows::rule('nfc_cards')->whereNotNull('card_batch_id')],
            'physical_card_uid' => 'sometimes|required|string|max:100',
            'physical_card_expected_uid' => 'present_with:physical_card_uid|nullable|string|max:50',
            'membership_mode' => ['sometimes', Rule::in(\App\Services\Loyalty\Members\MembershipAssignment::MODES)],
            'tier_id' => 'required_if:membership_mode,assigned|nullable|integer|min:1',
            'valid_from' => 'sometimes|nullable|string|max:10',
            'valid_until' => 'sometimes|nullable|string|max:10',
        ]);
        $assignment = array_intersect_key($data, array_flip(['membership_mode', 'tier_id', 'valid_from', 'valid_until']));
        if ($assignment !== []) {
            LoyaltyAccess::requireManager($request->user());
        }

        $physicalCard = array_intersect_key($data, array_flip(['physical_card_id', 'physical_card_uid', 'physical_card_expected_uid']));
        if ($physicalCard !== []) {
            LoyaltyAccess::requireActiveStaff($request->user());
        }

        $email = mb_strtolower(trim($data['email']));
        $withCard = isset($physicalCard['physical_card_id']);
        $this->assertAvailableEmail($email, $withCard);
        try {
            $result = $enrolment->enrol([
                'name'  => trim($data['name']),
                'email' => $email,
                'phone' => self::filled($data['phone'] ?? null),
            ] + $assignment + $physicalCard, $request->user(), $request->boolean('send_welcome', true));
        } catch (UniqueConstraintViolationException $e) {
            // A simultaneous enrolment can win after the availability check. The failed enrolment has rolled back.
            $this->assertAvailableEmail($email, $withCard);
            throw $e;
        }

        return response()->json([
            'member'     => MemberProfile::of($result['member']->fresh(['user'])),
            'email_sent' => $result['email_sent'],
        ], 201);
    }

    public function update(Request $request, int $id, MemberDetails $details): JsonResponse
    {
        $member = $this->member($id);
        $this->notErased($member);
        $user = $member->user;
        $currentEmail = $user?->getAttribute('email');
        $data = $request->validate([
            'name'              => 'required|string|max:255',
            'email'             => ['bail', 'required', 'email', 'max:255', function (string $attribute, string $value, \Closure $fail) use ($currentEmail) {
                $email = mb_strtolower(trim($value));
                if ($email !== mb_strtolower((string) $currentEmail)
                    && (User::isPlatformOperatorEmail($email) || $this->memberAccounts($email)->exists())) {
                    $fail(self::EMAIL_UNAVAILABLE);
                }
            }],
            'phone'             => 'nullable|string|max:20',
            'language'          => 'nullable|string|max:10',
            'nationality'       => 'nullable|string|max:100',
            'date_of_birth'     => 'nullable|date_format:Y-m-d|before_or_equal:' . VenueClock::today((int) $member->organization_id),
            'marketing_consent' => 'required|boolean',
        ]);
        $currentLanguage = $user?->getAttribute('language');
        $language = array_key_exists('language', $data) ? self::filled($data['language']) : $currentLanguage;
        if ($language !== null && !in_array($language, MemberDetails::LANGUAGES, true) && $language !== $currentLanguage) {
            throw ValidationException::withMessages(['language' => 'Choose one of the languages offered.']);
        }

        // Only what changed is written and audited: the form sends every field each time.
        $email = mb_strtolower(trim($data['email']));
        if (is_string($currentEmail) && $email === mb_strtolower($currentEmail)) {
            $email = $currentEmail;
        }
        $wanted = [
            'name'          => trim($data['name']),
            'email'         => $email,
            'phone'         => self::filled($data['phone'] ?? null),
            'nationality'   => self::filled($data['nationality'] ?? null),
            'language'      => $language,
            'date_of_birth' => $data['date_of_birth'] ?? null,
        ];
        $userFields = array_filter($wanted, fn ($value, $field) => $field === 'date_of_birth'
            ? $value !== $user?->date_of_birth?->toDateString()
            : $value !== $user?->{$field}, ARRAY_FILTER_USE_BOTH);
        $memberFields = (bool) $data['marketing_consent'] !== (bool) $member->marketing_consent
            ? ['marketing_consent' => (bool) $data['marketing_consent']] : [];

        if ($userFields !== [] || $memberFields !== []) {
            try {
                DB::transaction(fn () => $details->update($member, $memberFields, $userFields, $request->user()));
            } catch (UniqueConstraintViolationException $e) {
                if (isset($userFields['email'])) {
                    $this->assertAvailableEmail($email);
                }
                throw $e;
            }
        }

        return $this->answer($member);
    }

    /** A manager's tier, held until a day on the venue's clock or left to the next review (MemberDetails::changeTier). */
    public function tier(Request $request, int $id, MemberDetails $details): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $member = $this->member($id);
        $this->notErased($member);
        $data = $request->validate([
            'tier_id'    => 'required|integer',
            'keep_until' => 'nullable|date_format:Y-m-d|after:' . VenueClock::today((int) $member->organization_id),
        ]);
        // This organisation's tier: the id is looked up through the tenant scope, never trusted from `exists:`.
        $tier = LoyaltyTier::query()->find($data['tier_id'])
            ?? throw ValidationException::withMessages(['tier_id' => 'Choose one of the programme\'s tiers.']);

        $details->changeTier($member, $tier, $data['keep_until'] ?? null, $request->user());

        return $this->answer($member);
    }

    public function deactivate(Request $request, int $id, MemberStatus $status): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $member = $this->member($id);
        $status->deactivate($member, $request->user());

        return $this->answer($member);
    }

    public function reactivate(Request $request, int $id, MemberStatus $status): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $member = $this->member($id);
        $this->notErased($member);
        $status->reactivate($member, $request->user());

        return $this->answer($member);
    }

    /** Delete (anonymise); the manager types the member's name to confirm (trimmed, in any case). */
    public function erase(Request $request, int $id, MemberErasure $erasure): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $member = $this->member($id);
        $this->notErased($member);
        $data = $request->validate(['confirm_name' => 'required|string|max:255']);
        if (mb_strtolower(trim($data['confirm_name'])) !== mb_strtolower(trim((string) $member->user?->name))) {
            throw new LoyaltyRefused('name_mismatch', 'The name typed is not the member\'s.', 422);
        }

        $erasure->erase($member, $request->user());

        return $this->answer($member);
    }

    public function card(int $id, MemberCard $card): JsonResponse
    {
        $member = $this->member($id);
        $this->notErased($member);

        return response()->json($card->of($member));
    }

    /**
     * The welcome email again, at most once per member every ten minutes (`too_soon`, with the seconds to wait); a
     * send that fails frees the ten minutes and says so (`email_failed`) without the mail server's words.
     */
    public function welcome(Request $request, int $id, MemberEnrolment $enrolment): JsonResponse
    {
        $member = $this->member($id);
        $this->notErased($member);
        if (!$member->user?->email) {
            throw new LoyaltyRefused('no_email', 'The member has no email address.', 422);
        }

        $key = "loyalty-welcome:{$member->organization_id}:{$member->id}";
        if (!Cache::add($key, now()->addSeconds(self::WELCOME_EVERY)->getTimestamp(), self::WELCOME_EVERY)) {
            $until = (int) Cache::get($key, 0);
            throw new LoyaltyRefused('too_soon', 'The welcome email was sent a moment ago.', 429, ['retry_after' => max(1, $until - now()->getTimestamp())]);
        }

        try {
            $sentTo = $enrolment->resendWelcome($member);
        } catch (WelcomeNotSent) {
            Cache::forget($key);
            throw new LoyaltyRefused('email_failed', 'The welcome email could not be sent.', 502);
        }

        return response()->json(['sent_to' => $sentTo]);
    }

    private function answer(LoyaltyMember $member): JsonResponse
    {
        return response()->json(['member' => MemberProfile::of($member->fresh(['user']))]);
    }

    private function notErased(LoyaltyMember $member): void
    {
        if (MemberErasure::isErased($member)) {
            throw new LoyaltyRefused('already_erased', 'This member was deleted.', 409);
        }
    }

    /** A member sign-in address is unique across Loyalty. A staff sign-in uses its own account. */
    private function assertAvailableEmail(string $email, bool $withCard = false): void
    {
        $accounts = $this->memberAccounts($email)->limit(2)->get();
        if ($accounts->isEmpty() && !User::isPlatformOperatorEmail($email)) {
            return;
        }

        $account = $accounts->count() === 1 ? $accounts->first() : null;
        if ($withCard && $account && OwnAccount::is($account, (int) app('current_organization_id'))) {
            $members = LoyaltyMember::query()->where('user_id', $account->id)->limit(2)->get();
            $member = $members->count() === 1 ? $members->first() : null;
            if ($member && !MemberErasure::isErased($member->setRelation('user', $account))) {
                $message = 'A member in this company already uses this email.';
                throw new LoyaltyRefused('member_email_exists', $message, 422, [
                    'errors' => ['email' => [$message]],
                    'member' => [
                        'id' => (int) $member->id,
                        'name' => $account->name,
                        'member_number' => $member->member_number,
                        'is_active' => (bool) $member->is_active,
                    ],
                ]);
            }
        }

        throw new LoyaltyRefused('member_email_unavailable', self::EMAIL_UNAVAILABLE, 422, ['errors' => ['email' => [self::EMAIL_UNAVAILABLE]]]);
    }

    /** @return Builder<User> */
    private function memberAccounts(string $email): Builder
    {
        return User::query()->where('user_type', 'member')->whereRaw('LOWER(email) = ?', [$email]);
    }

    /** One of this organisation's members (the tenant scope), or 404. */
    private function member(int $id): LoyaltyMember
    {
        return LoyaltyMember::query()->with('user')->find($id) ?? throw LoyaltyRefused::notFound();
    }

    private static function filled(?string $text): ?string
    {
        $text = $text === null ? null : trim($text);

        return $text === '' ? null : $text;
    }
}
