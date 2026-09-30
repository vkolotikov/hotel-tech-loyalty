<?php

namespace App\Services\Appointments;

use App\Models\Guest;
use App\Models\ServiceBooking;
use Illuminate\Support\Str;

/**
 * Clients for the appointments workspace: the organisation's own `guests`
 * rows, the same people the full admin lists under Customers. Nothing here
 * merges two rows — a likely duplicate is shown to the operator, who
 * decides.
 */
final class ClientDirectory
{
    private const ACTIVE = ['pending', 'confirmed', 'in_progress'];

    public function __construct(
        private readonly AppointmentPresenter $presenter,
        private readonly LoyaltyCard $loyalty,
    ) {
    }

    /** @return array{id: int, name: string, phone: ?string, email: ?string, member: ?array} */
    public function summary(Guest $guest): array
    {
        $guest->loadMissing('member.tier');

        return [
            'id'     => (int) $guest->id,
            'name'   => (string) $guest->full_name,
            'phone'  => $guest->phone ?: ($guest->mobile ?: null),
            'email'  => $guest->email ?: null,
            'member' => $guest->member ? LoyaltyCard::memberSummary($guest->member) : null,
        ];
    }

    /** @return list<array<string, mixed>> */
    public function search(string $term): array
    {
        $needle = '%' . mb_strtolower(trim($term)) . '%';
        $digits = (string) preg_replace('/\D/', '', $term);

        return Guest::with('member.tier')
            ->where(function ($q) use ($needle, $digits) {
                $q->whereRaw('LOWER(full_name) LIKE ?', [$needle])
                    ->orWhereRaw('LOWER(email) LIKE ?', [$needle]);
                if (strlen($digits) >= 3) {
                    $q->orWhere('phone_key', 'like', "%{$digits}%");
                }
            })
            ->orderBy('full_name')
            ->limit(20)
            ->get()
            ->map(fn (Guest $g) => $this->summary($g))
            ->all();
    }

    /** Clients whose normalised email or phone is the one given. @return list<array<string, mixed>> */
    public function possibleDuplicates(?string $email, ?string $phone): array
    {
        $emailKey = Guest::normalizeEmailKey($email);
        $phoneKey = Guest::normalizePhoneKey($phone);
        if (!$emailKey && !$phoneKey) {
            return [];
        }

        return Guest::with('member.tier')
            ->where(function ($q) use ($emailKey, $phoneKey) {
                if ($emailKey) {
                    $q->orWhere('email_key', $emailKey)->orWhereRaw('LOWER(email) = ?', [$emailKey]);
                }
                if ($phoneKey) {
                    $q->orWhere('phone_key', $phoneKey);
                }
            })
            ->orderBy('id')
            ->limit(5)
            ->get()
            ->map(fn (Guest $g) => $this->summary($g))
            ->all();
    }

    public function create(string $name, ?string $phone, ?string $email): Guest
    {
        $name = trim($name);
        $phone = $phone !== null ? trim($phone) : null;
        $email = $email !== null ? trim($email) : null;

        // Nulls are left out so the table's own defaults apply (several
        // guests columns are NOT NULL with a default on PostgreSQL).
        $guest = Guest::create(array_filter([
            'full_name'   => mb_substr($name, 0, 200),
            'first_name'  => mb_substr(Str::before($name, ' '), 0, 100),
            'last_name'   => str_contains($name, ' ') ? mb_substr(Str::after($name, ' '), 0, 100) : null,
            'email'       => $email ?: null,
            'phone'       => $phone ?: null,
            'email_key'   => Guest::normalizeEmailKey($email),
            'phone_key'   => Guest::normalizePhoneKey($phone),
            'lead_source' => 'Appointments',
        ], fn ($value) => $value !== null && $value !== ''));

        // Guest::created may have enrolled a member and linked it.
        return $guest->fresh();
    }

    /** @return array<string, mixed> */
    public function profile(Guest $guest): array
    {
        $orgId = (int) $guest->organization_id;
        $now = VenueClock::now($orgId)->format('Y-m-d H:i:s');
        $own = fn () => ServiceBooking::with(['service', 'master'])->where('guest_id', $guest->id);

        $upcoming = $own()->whereIn('status', self::ACTIVE)->where('start_at', '>=', $now)->orderBy('start_at')->limit(20)->get();
        $past = $own()
            ->where(fn ($q) => $q->whereNotIn('status', self::ACTIVE)->orWhere('start_at', '<', $now))
            ->orderByDesc('start_at')->limit(20)->get();

        // Bookings made before clients were linked carry an email and no
        // client id. They are listed apart, labelled as matched by email,
        // and nothing is written to link them.
        $emailKey = Guest::normalizeEmailKey($guest->email);
        $byEmail = $emailKey
            ? ServiceBooking::with(['service', 'master'])->whereNull('guest_id')
                ->whereRaw('LOWER(customer_email) = ?', [$emailKey])
                ->orderByDesc('start_at')->limit(20)->get()
            : collect();

        $last = $own()->orderByDesc('start_at')->first();
        $guest->loadMissing('member.tier');
        $summaries = fn ($bookings) => $bookings->map(fn (ServiceBooking $b) => $this->presenter->summary($b))->values()->all();

        return [
            'client'           => $this->summary($guest),
            'upcoming'         => $summaries($upcoming),
            'past'             => $summaries($past),
            'matched_by_email' => $summaries($byEmail),
            'loyalty'          => $this->loyalty->forMember($orgId, $guest->member),
            'last'             => $last ? [
                'service_id' => (int) $last->service_id,
                'master_id'  => $last->service_master_id ? (int) $last->service_master_id : null,
            ] : null,
        ];
    }
}
