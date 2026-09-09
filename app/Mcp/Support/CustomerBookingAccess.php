<?php

namespace App\Mcp\Support;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\BookingNote;
use App\Models\Guest;
use App\Models\Reservation;
use App\Models\ServiceBooking;
use App\Models\Staff;
use App\Models\User;
use App\OAuth\PluginIdentity;
use App\Scopes\BrandScope;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Narrow, tenant-scoped data access shared by the ChatGPT tools. */
class CustomerBookingAccess
{
    public const MAX_BOOKING_PAGE = 100;

    public function authorize(): User
    {
        $user = auth()->user();
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if (! $user instanceof User || $user->user_type !== 'staff' || ! $orgId
            || (int) $user->organization_id !== (int) $orgId
            || ! PluginIdentity::active($user)) {
            throw new AuthorizationException('An active HexaTech staff account in this organization is required.');
        }

        return $user;
    }

    public function searchCustomers(array $data): array
    {
        $this->authorize();
        $query = Guest::query()->select($this->customerColumns());
        $this->search($query, ['full_name', 'email', 'phone', 'company'], $data['query']);
        $limit = $data['limit'] ?? 20;
        $rows = $query->orderBy('id')->where('id', '>', $data['after_id'] ?? 0)->limit($limit + 1)->get();
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit);

        return ['customers' => $rows->map(fn ($row) => $this->customer($row))->values()->all(),
            'next_after_id' => $more ? $rows->last()->id : null];
    }

    public function getCustomer(int $id): array
    {
        $this->authorize();
        $guest = Guest::select($this->customerColumns())->findOrFail($id);
        $notes = $guest->activities()->where('type', 'note')->orderByDesc('id')->limit(11)
            ->get(['id', 'description', 'performed_by', 'created_at']);

        return ['customer' => $this->customer($guest),
            'notes' => $notes->take(10)->map(fn ($note) => [
                'id' => $note->id, 'body' => mb_substr($note->description ?? '', 0, 2000),
                'body_truncated' => mb_strlen($note->description ?? '') > 2000,
                'performed_by' => $note->performed_by, 'created_at' => $note->created_at?->toIso8601String(),
            ])->values()->all(), 'has_more_notes' => $notes->count() > 10];
    }

    public function listBookings(array $data): array
    {
        $user = $this->authorize();
        $timezone = $user->organization->timezone ?: 'UTC';
        $from = CarbonImmutable::parse($data['from'] ?? 'today', $timezone)->startOfDay();
        $to = isset($data['to']) ? CarbonImmutable::parse($data['to'], $timezone)->startOfDay() : $from->addDays(30);
        if ($to->lessThan($from) || $from->diffInDays($to) > 90) {
            throw ValidationException::withMessages(['to' => 'The booking date range must be ordered and no longer than 90 days.']);
        }

        $kind = $data['kind'];
        $dateColumn = match ($kind) {
            'room' => 'arrival_date', 'service' => 'start_at', default => 'check_in'
        };
        $query = $this->bookingQuery($kind);
        if ($kind === 'service') {
            // Service timestamps are stored in UTC; date-only filters use the organization's timezone.
            $query->where($dateColumn, '>=', $from->utc())->where($dateColumn, '<', $to->addDay()->utc());
        } else {
            $query->whereBetween($dateColumn, [$from->toDateString(), $to->toDateString()]);
        }
        if (! empty($data['query'])) {
            $columns = match ($kind) {
                'room' => ['guest_name', 'guest_email', 'booking_reference'],
                'service' => ['customer_name', 'customer_email', 'booking_reference'],
                default => ['confirmation_no', 'room_number'],
            };
            $this->search($query, $columns, $data['query']);
        }
        $limit = $data['limit'] ?? 20;
        $page = $data['page'] ?? 1;
        $rows = $query->orderBy($dateColumn)->orderBy('id')->offset(($page - 1) * $limit)->limit($limit + 1)->get();
        $more = $rows->count() > $limit;
        $truncated = $more && $page >= self::MAX_BOOKING_PAGE;
        $rows = $rows->take($limit);
        if ($kind === 'room') {
            $rows->load('priceElements:id,booking_mirror_id,currency_code');
        }

        return ['kind' => $kind, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'timezone' => $timezone,
            'bookings' => $rows->map(fn ($row) => $this->booking($kind, $row))->values()->all(),
            'next_page' => $more && ! $truncated ? $page + 1 : null,
            'results_truncated' => $truncated,
            'truncation_message' => $truncated
                ? 'More matching bookings exist beyond the page limit. This is not a complete result set. Narrow the date range or search, or restart with a larger limit (up to 50).'
                : null];
    }

    public function getBooking(string $kind, int $id): array
    {
        $this->authorize();
        $record = $this->bookingQuery($kind)->findOrFail($id);
        if ($kind === 'room') {
            $record->load('priceElements:id,booking_mirror_id,currency_code');
        }
        $result = $this->booking($kind, $record);
        if ($kind === 'room') {
            $notes = BookingNote::where('booking_mirror_id', $record->id)->orderByDesc('id')->limit(11)
                ->get(['id', 'body', 'created_at']);
            $result['notes'] = $notes->take(10)->map(fn ($note) => [
                'id' => $note->id, 'body' => mb_substr($note->body ?? '', 0, 2000),
                'body_truncated' => mb_strlen($note->body ?? '') > 2000,
                'created_at' => $note->created_at?->toIso8601String(),
            ])->all();
            $result['has_more_notes'] = $notes->count() > 10;
        } else {
            $notes = $record->{$kind === 'service' ? 'staff_notes' : 'notes'} ?? '';
            $result['staff_notes'] = mb_substr($notes, -6000);
            $result['staff_notes_truncated'] = mb_strlen($notes) > 6000;
        }

        return ['booking' => $result];
    }

    public function addCustomerNote(int $id, string $body, string $requestId): array
    {
        $user = $this->authorize();

        return DB::transaction(function () use ($id, $body, $requestId, $user) {
            $guest = Guest::lockForUpdate()->findOrFail($id);

            return $this->appendOnce($guest, 'customer', $body, $requestId, $user, function () use ($guest, $body, $user) {
                $note = $guest->activities()->create(['type' => 'note', 'description' => $body, 'performed_by' => $user->name]);
                $guest->update(['last_activity_at' => now()]);

                return $note->id;
            });
        });
    }

    public function addBookingNote(string $kind, int $id, string $body, string $requestId): array
    {
        $user = $this->authorize();

        return DB::transaction(function () use ($kind, $id, $body, $requestId, $user) {
            $record = $this->bookingQuery($kind)->lockForUpdate()->findOrFail($id);

            return $this->appendOnce($record, $kind, $body, $requestId, $user, function () use ($record, $kind, $body, $user) {
                if ($kind === 'room') {
                    $staffId = Staff::where('user_id', $user->id)->value('id');

                    return BookingNote::create(['booking_mirror_id' => $record->id,
                        'reservation_id' => $record->reservation_id, 'staff_id' => $staffId,
                        'body' => $body, 'created_at' => now()])->id;
                }
                $field = $kind === 'service' ? 'staff_notes' : 'notes';
                $entry = '['.now()->toIso8601String().' · '.$user->name.' via ChatGPT] '.$body;
                $record->update([$field => trim(($record->{$field} ?? '')."\n\n".$entry)]);

                return null;
            });
        });
    }

    private function appendOnce(Model $record, string $kind, string $body, string $requestId, User $user, callable $append): array
    {
        // The locked subject row serializes simultaneous retries. The audit and note
        // commit together, so a timeout can be retried with the same request UUID.
        $action = 'chatgpt.note_added';
        $existing = AuditLog::where('action', $action)->where('subject_type', get_class($record))
            ->where('subject_id', $record->id)->where('causer_id', $user->id)
            ->where('causer_type', User::class)->where('new_values->request_id', $requestId)->first();
        $bodyHash = hash('sha256', $body);
        if ($existing) {
            if (($existing->new_values['body_hash'] ?? null) !== $bodyHash) {
                throw ValidationException::withMessages(['request_id' => 'This request ID was already used with different note text.']);
            }

            return ['saved' => true, 'kind' => $kind, 'id' => $record->id, 'request_id' => $requestId, 'replayed' => true];
        }
        $noteId = $append();
        AuditLog::create(['action' => $action, 'subject_type' => get_class($record), 'subject_id' => $record->id,
            'causer_type' => User::class, 'causer_id' => $user->id,
            'new_values' => ['request_id' => $requestId, 'body_hash' => $bodyHash, 'note_id' => $noteId],
            'description' => 'Internal note added through ChatGPT.']);

        return ['saved' => true, 'kind' => $kind, 'id' => $record->id, 'request_id' => $requestId, 'replayed' => false];
    }

    private function bookingQuery(string $kind): Builder
    {
        $query = match ($kind) {
            'room' => BookingMirror::query(),
            'service' => ServiceBooking::query()->withoutGlobalScope(BrandScope::class),
            'reservation' => Reservation::query()->withoutGlobalScope(BrandScope::class),
            default => throw ValidationException::withMessages(['kind' => 'Choose room, reservation, or service.']),
        };
        if ($kind !== 'room') {
            $user = auth()->user();
            // The app's brand middleware handles one selected brand. The connector
            // has no brand selector: constrain to the complete allowed pivot set.
            $restricted = DB::table('brand_user')->where('user_id', $user->id)->exists();
            if ($restricted && ! $user->isPlatformAdmin()) {
                // Retain the restriction even if every assigned brand was archived
                // or an old pivot points outside the user's current organization.
                $query->whereIn('brand_id', $user->brands()->pluck('brands.id')->all());
            }
        }

        return $query;
    }

    private function customerColumns(): array
    {
        return ['id', 'full_name', 'email', 'phone', 'company', 'country', 'lifecycle_status', 'importance'];
    }

    private function customer(Guest $guest): array
    {
        // Never serialize the full model: it includes identity documents, DOB,
        // custom fields and possibly sensitive free-form preferences.
        return $guest->only($this->customerColumns());
    }

    private function booking(string $kind, Model $row): array
    {
        return match ($kind) {
            'room' => ['kind' => $kind, 'id' => $row->id, 'reference' => $row->booking_reference,
                'customer_name' => $row->guest_name, 'customer_id' => $row->guest_id,
                'unit' => $row->apartment_name, 'start' => $row->arrival_date?->toDateString(),
                'end' => $row->departure_date?->toDateString(), 'status' => $row->booking_state,
                'payment_status' => $row->payment_status, 'total_amount' => $row->price_total,
                'currency' => $this->roomCurrency($row)],
            'service' => ['kind' => $kind, 'id' => $row->id, 'reference' => $row->booking_reference,
                'customer_name' => $row->customer_name, 'customer_id' => $row->guest_id,
                'service_id' => $row->service_id, 'master_id' => $row->service_master_id,
                'start' => $row->start_at?->toIso8601String(), 'end' => $row->end_at?->toIso8601String(),
                'status' => $row->status, 'payment_status' => $row->payment_status,
                'total_amount' => $row->total_amount, 'currency' => $row->currency],
            default => ['kind' => $kind, 'id' => $row->id, 'reference' => $row->confirmation_no,
                'customer_id' => $row->guest_id, 'property_id' => $row->property_id, 'room' => $row->room_number,
                'start' => $row->check_in?->toDateString(), 'end' => $row->check_out?->toDateString(),
                'status' => $row->status, 'payment_status' => $row->payment_status,
                // CRM reservations do not persist a currency. Current organization
                // or hotel settings cannot identify the currency of a historical total.
                'total_amount' => $row->total_amount, 'currency' => null],
        };
    }

    private function roomCurrency(BookingMirror $booking): ?string
    {
        // Price elements retain the booking/provider currency. Do not invent a
        // currency when they are absent, incomplete, or disagree with each other.
        $currencies = $booking->priceElements->pluck('currency_code')->map(function ($code) {
            $code = strtoupper(trim((string) $code));

            return preg_match('/^[A-Z]{3}$/', $code) ? $code : null;
        })->unique()->values();

        return $currencies->count() === 1 ? $currencies->first() : null;
    }

    private function search(Builder $query, array $columns, string $needle): void
    {
        // Literal substring search, parameter-bound and portable to SQLite tests.
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower(trim($needle))).'%';
        $query->where(function (Builder $nested) use ($columns, $pattern) {
            foreach ($columns as $column) {
                $nested->orWhereRaw("LOWER({$column}) LIKE ? ESCAPE '!'", [$pattern]);
            }
        });
    }
}
