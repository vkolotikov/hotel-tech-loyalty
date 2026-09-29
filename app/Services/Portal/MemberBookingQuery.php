<?php

namespace App\Services\Portal;

use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\ServiceBooking;
use App\Services\Booking\MemberCancellation;
use App\Services\Booking\PortalPaymentIntentGuard;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * The member's bookings as one list, whatever table they came from.
 *
 * A booking belongs to the member when, inside the member's organisation,
 * it names their member_id (service_bookings.member_id or
 * booking_mirror.member_id), or a guest linked to them, or simply their
 * email. The email rule is what gives a member the history the widget and
 * the app's WebView wrote before anything linked a member at all — but it
 * only applies once the member has PROVEN that email, not merely typed it:
 * POST /v1/auth/register hands out a Sanctum token for any address nobody
 * else has used yet, no verification step, so an unverified email match is
 * not evidence of ownership — it is evidence someone knows a string. Only
 * users.email_verified_at (stamped by the code-verified claim flow) turns
 * "typed this email" into "proved this email", and only then does the
 * email rule apply. member_id and linked-guest ownership are unaffected.
 *
 * Mirrors are read through the Smoobu integration scope exactly as staff
 * read them, so a venue that switched Smoobu off hides the same rows here.
 */
final class MemberBookingQuery
{
    public const UPCOMING = 'upcoming';
    public const PAST     = 'past';

    /** Statuses that mean the appointment never happens. */
    private const SERVICE_DEAD = ['cancelled', 'no_show'];
    private const STAY_DEAD    = ['cancelled', 'no-show', 'no_show'];

    public function list(LoyaltyMember $member, string $scope, int $page = 1, int $perPage = 20): array
    {
        $rows = $this->all($member, $scope);
        $page = max(1, $page);

        return [
            'data' => $rows->forPage($page, $perPage)->values()->all(),
            'meta' => ['scope' => $scope, 'page' => $page, 'per_page' => $perPage, 'total' => $rows->count()],
        ];
    }

    public function count(LoyaltyMember $member, string $scope): int
    {
        return $this->all($member, $scope)->count();
    }

    public function find(LoyaltyMember $member, string $kind, int $id): ?array
    {
        if ($kind === 'service') {
            $row = $this->services($member)->with(['service', 'master'])->whereKey($id)->first();
            return $row ? self::serviceDto($row) : null;
        }
        if ($kind === 'stay') {
            $row = $this->stays($member)->whereKey($id)->first();
            return $row ? self::stayDto($row) : null;
        }
        return null;
    }

    private function all(LoyaltyMember $member, string $scope): Collection
    {
        $upcoming = $scope === self::UPCOMING;

        $services = $this->services($member)->with(['service', 'master'])->get()
            ->map(fn (ServiceBooking $b) => self::serviceDto($b));
        $stays = $this->stays($member)->get()
            ->map(fn (BookingMirror $m) => self::stayDto($m));

        // An appointment's ends_at carries the venue's offset (serviceDto()),
        // so strtotime() reads the true instant; a stay's is a plain date.
        // "Now" from Carbon (the same clock as time() outside tests).
        $now = CarbonImmutable::now()->getTimestamp();
        $rows = $services->concat($stays)->filter(function (array $dto) use ($upcoming, $now) {
            $ends = $dto['ends_at'] ?? $dto['starts_at'];
            $live = !in_array($dto['status'], ['cancelled', 'no_show', 'completed'], true)
                && $ends !== null && strtotime($ends) >= $now;
            return $upcoming ? $live : !$live;
        });

        return $upcoming
            ? $rows->sortBy(fn ($d) => $d['starts_at'] ?? '')->values()
            : $rows->sortByDesc(fn ($d) => $d['starts_at'] ?? '')->values();
    }

    private function services(LoyaltyMember $member): Builder
    {
        return $this->owned(
            ServiceBooking::query()->withoutGlobalScopes()->where('service_bookings.organization_id', $member->organization_id),
            $member, 'member_id', 'guest_id', 'customer_email',
        );
    }

    private function stays(LoyaltyMember $member): Builder
    {
        // Keep TenantScope (the request has bound the tenant) and the Smoobu
        // scope, and name the org too.
        return $this->owned(
            BookingMirror::query()->where('booking_mirror.organization_id', $member->organization_id),
            $member, 'member_id', 'guest_id', 'guest_email',
        );
    }

    private function owned(Builder $query, LoyaltyMember $member, ?string $memberColumn, string $guestColumn, string $emailColumn): Builder
    {
        $guestIds = Guest::withoutGlobalScopes()
            ->where('organization_id', $member->organization_id)
            ->where('member_id', $member->id)
            ->pluck('id')
            ->all();
        // Only a verified email proves ownership (see class docblock) —
        // an unverified member's email is treated as absent, which the
        // $email !== '' check below already turns into "skip this clause".
        $verified = $member->user?->email_verified_at !== null;
        $email = $verified ? mb_strtolower(trim((string) ($member->user?->email ?? ''))) : '';

        return $query->where(function (Builder $q) use ($member, $memberColumn, $guestColumn, $guestIds, $emailColumn, $email) {
            $any = false;
            if ($memberColumn) {
                $q->where($memberColumn, $member->id);
                $any = true;
            }
            if ($guestIds) {
                $any ? $q->orWhereIn($guestColumn, $guestIds) : $q->whereIn($guestColumn, $guestIds);
                $any = true;
            }
            if ($email !== '') {
                $any ? $q->orWhereRaw("LOWER({$emailColumn}) = ?", [$email]) : $q->whereRaw("LOWER({$emailColumn}) = ?", [$email]);
                $any = true;
            }
            if (!$any) {
                $q->whereRaw('1 = 0');
            }
        });
    }

    public static function serviceDto(ServiceBooking $b): array
    {
        $policy = MemberCancellation::policyFor($b);
        $status = in_array($b->status, self::SERVICE_DEAD, true) ? 'cancelled' : $b->status;
        // The stored digits are the venue's wall clock: sent as true instants
        // with the venue's offset (never `Z`), so the client's date and time
        // are the venue's and all() splits upcoming/past on the real moment.
        // zoneFor() is memoised per organisation: one read for a whole list.
        $zone = AppointmentClock::zoneFor((int) $b->organization_id);

        return [
            'kind'            => 'service',
            'id'              => $b->id,
            'reference'       => $b->booking_reference,
            'title'           => $b->service?->name ?? 'Service',
            'subtitle'        => $b->master?->name,
            'starts_at'       => $b->start_at ? AppointmentClock::iso($b->start_at, $zone) : null,
            'ends_at'         => $b->end_at ? AppointmentClock::iso($b->end_at, $zone) : null,
            'status'          => $status,
            'payment_status'  => self::payment($b->payment_status),
            'total'           => (float) $b->total_amount,
            'currency'        => strtoupper((string) ($b->currency ?: 'EUR')),
            'discount'        => (float) $b->discount_amount > 0 ? ['amount' => round((float) $b->discount_amount, 2), 'label' => $b->discount_label ?: 'Member discount'] : null,
            'can_cancel'      => $policy['can_cancel'],
            'cancel_deadline' => $policy['deadline']?->toIso8601String(),
            'notes'           => $b->customer_notes,
            'party_size'      => $b->party_size !== null ? (int) $b->party_size : null,
            'guests'          => null,
            'nights'          => null,
            // service_bookings has no payment_method column to check.
            'paid_online'     => self::hasRealIntent($b->stripe_payment_intent_id, null),
        ];
    }

    public static function stayDto(BookingMirror $m): array
    {
        $policy = MemberCancellation::policyFor($m);
        $internal = (string) $m->internal_status;
        $status = match (true) {
            // BookingRefundService marks a cancelled stay on booking_state.
            in_array($internal, self::STAY_DEAD, true), (string) $m->booking_state === 'cancelled' => 'cancelled',
            $internal === 'checked-out'               => 'completed',
            $internal === 'checked-in'                => 'in_progress',
            default                                   => 'confirmed',
        };
        $nights = ($m->arrival_date && $m->departure_date) ? $m->arrival_date->diffInDays($m->departure_date) : null;
        $guests = (int) $m->adults + (int) $m->children;

        return [
            'kind'            => 'stay',
            'id'              => $m->id,
            'reference'       => $m->booking_reference ?: (string) $m->reservation_id,
            'title'           => $m->apartment_name ?: 'Stay',
            'subtitle'        => $nights !== null ? "{$nights}n · {$guests}p" : null,
            'starts_at'       => $m->arrival_date?->toDateString(),
            'ends_at'         => $m->departure_date?->toDateString(),
            'status'          => $status,
            'payment_status'  => self::payment($m->payment_status instanceof \BackedEnum ? $m->payment_status->value : $m->payment_status),
            'total'           => (float) $m->price_total,
            'currency'        => strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
            'discount'        => (float) $m->discount_amount > 0 ? ['amount' => round((float) $m->discount_amount, 2), 'label' => $m->discount_label ?: 'Member discount'] : null,
            'can_cancel'      => $policy['can_cancel'],
            'cancel_deadline' => $policy['deadline']?->toIso8601String(),
            'notes'           => $m->member_id ? ($m->notice ?: null) : null,
            'party_size'      => null,
            'guests'          => $guests,
            'nights'          => $nights,
            'paid_online'     => self::hasRealIntent($m->stripe_payment_intent_id, $m->payment_method),
        ];
    }

    /** One spelling for the portal: the capture job can write Stripe's own `canceled`. */
    private static function payment(mixed $status): ?string
    {
        $status = $status === null ? null : (string) $status;

        return $status === 'canceled' ? 'cancelled' : $status;
    }

    /** `paid_online`: the one "real payment intent" rule, PortalPaymentIntentGuard::isRealIntent(). */
    private static function hasRealIntent(mixed $intentId, mixed $paymentMethod): bool
    {
        return PortalPaymentIntentGuard::isRealIntent($intentId, $paymentMethod);
    }
}
