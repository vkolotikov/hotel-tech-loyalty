<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;

/**
 * A service booking as the appointments workspace sees it.
 *
 * summary() is the calendar row: time, client name, service, status — no
 * notes, no contact details, no loyalty, so broad calendar payloads carry
 * nothing sensitive. detail() is the side panel.
 */
final class AppointmentPresenter
{
    public function __construct(
        private readonly AppointmentActions $actions,
        private readonly LoyaltyCard $loyalty,
    ) {
    }

    /**
     * A fingerprint of everything a second operator could have changed.
     * Every write sends it back; a mismatch under the row lock is a stale edit.
     */
    public static function revision(ServiceBooking $b): string
    {
        return substr(hash('sha256', implode('|', [
            VenueClock::wall($b->start_at),
            VenueClock::wall($b->end_at),
            (int) $b->service_master_id,
            (string) $b->status,
            (string) $b->payment_status,
            md5((string) $b->staff_notes),
            $b->updated_at?->getTimestamp() ?? 0,
        ])), 0, 16);
    }

    /** What the row shows about money — never more than it shows. */
    public static function paymentState(ServiceBooking $b): string
    {
        $card = AppointmentActions::carriesCardPayment($b);
        $refunded = (float) ($b->refunded_amount ?? 0);

        return match ((string) $b->payment_status) {
            'unpaid'                => 'not_paid_online',
            'authorized', 'pending' => $card ? 'card_held' : 'not_paid_online',
            'paid'                  => $card ? 'paid_by_card' : 'marked_paid',
            'refunded'              => $refunded > 0 ? 'refunded' : 'marked_refunded',
            'partially_refunded'    => 'partially_refunded',
            'failed'                => 'failed',
            'cancelled'             => 'hold_released',
            default                 => 'unknown',
        };
    }

    /** @return array<string, mixed> */
    public function summary(ServiceBooking $b): array
    {
        $b->loadMissing(['service', 'master']);

        return [
            'id'               => (int) $b->id,
            'reference'        => (string) $b->booking_reference,
            'start'            => VenueClock::wall($b->start_at),
            'end'              => VenueClock::wall($b->end_at),
            'duration_minutes' => (int) $b->duration_minutes,
            'service'          => $b->service ? ['id' => (int) $b->service->id, 'name' => (string) $b->service->name] : null,
            'master'           => $b->master ? ['id' => (int) $b->master->id, 'name' => (string) $b->master->name] : null,
            'client'           => [
                'id'        => $b->guest_id ? (int) $b->guest_id : null,
                'name'      => (string) $b->customer_name,
                'is_member' => (bool) $b->member_id,
            ],
            'status'           => (string) $b->status,
            'payment'          => ['state' => self::paymentState($b)],
            'revision'         => self::revision($b),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(ServiceBooking $b): array
    {
        $b->loadMissing(['service', 'master', 'member.tier']);
        $member = $b->member_id ? $b->member : null;
        $refunded = (float) ($b->refunded_amount ?? 0);

        return array_merge($this->summary($b), [
            'client'  => [
                'id'     => $b->guest_id ? (int) $b->guest_id : null,
                'name'   => (string) $b->customer_name,
                'phone'  => $b->customer_phone ?: null,
                'email'  => $b->customer_email ?: null,
                'member' => $member ? LoyaltyCard::memberSummary($member) : null,
            ],
            'payment' => [
                'state'                => self::paymentState($b),
                'raw'                  => (string) $b->payment_status,
                'amount'               => (float) $b->total_amount,
                'refunded_amount'      => $refunded > 0 ? $refunded : null,
                'carries_card_payment' => AppointmentActions::carriesCardPayment($b),
                'currency'             => $b->currency ?: 'EUR',
            ],
            'price'   => [
                'total'          => (float) $b->total_amount,
                'list'           => $b->list_amount !== null ? (float) $b->list_amount : null,
                'discount_label' => ((float) $b->discount_amount) > 0 ? ($b->discount_label ?: 'Member discount') : null,
                'currency'       => $b->currency ?: 'EUR',
            ],
            'source'  => (string) $b->source,
            'notes'   => ['customer' => $b->customer_notes ?: null, 'staff' => $b->staff_notes ?: null],
            'actions' => $this->actions->for($b),
            'loyalty' => $this->loyalty->forBooking($b),
            'history' => $this->history($b),
        ]);
    }

    /**
     * Who changed this appointment and when: the audit rows whose subject is
     * the booking, newest first. `at` is a real instant (UTC), unlike the
     * appointment's own times.
     *
     * @return list<array{at: ?string, actor: ?string, action: string, description: ?string, changes: array{old: mixed, new: mixed}}>
     */
    private function history(ServiceBooking $b): array
    {
        $rows = AuditLog::where('subject_type', ServiceBooking::class)
            ->where('subject_id', $b->id)
            ->orderByDesc('id')
            ->limit(30)
            ->get();

        $names = User::whereIn('id', $rows->where('causer_type', User::class)->pluck('causer_id')->filter()->unique()->all())
            ->pluck('name', 'id');

        return $rows->map(fn (AuditLog $row) => [
            'at'          => $row->created_at?->toIso8601String(),
            'actor'       => $row->causer_type === User::class ? ($names[$row->causer_id] ?? null) : null,
            'action'      => (string) $row->action,
            'description' => $row->description,
            'changes'     => ['old' => $row->old_values ?: null, 'new' => $row->new_values ?: null],
        ])->all();
    }
}
