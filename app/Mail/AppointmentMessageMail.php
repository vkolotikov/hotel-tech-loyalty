<?php

namespace App\Mail;

use App\Models\ClientMessage;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\Money\Deposits;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One client message about an appointment (Part D): booked, moved,
 * confirmed, cancelled or the reminder, in the row's language, sent as the
 * venue. Every word comes from lang/{locale}/client_messages.php, asked for
 * in that locale explicitly, so nothing depends on the worker's own locale.
 * Not queued itself: DeliverClientMessage sends it and then marks the row.
 */
class AppointmentMessageMail extends Mailable
{
    use Concerns\SendsAsVenue;
    use Queueable, SerializesModels;

    public function __construct(public ClientMessage $message, public ServiceBooking $booking)
    {
        $this->captureVenue((int) $booking->organization_id);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->lines()['subject'],
            from:    $this->venueFrom(),
            replyTo: $this->venueReplyTo(),
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.appointment-message', with: $this->lines());
    }

    /** Every word of this message, in its language. */
    public function lines(): array
    {
        $locale = (string) $this->message->locale;
        $kind = (string) $this->message->kind;
        $b = $this->booking;
        $org = Organization::withoutGlobalScopes()->find($b->organization_id);
        $venue = (string) ($org?->name ?? '');
        $service = (string) ($b->service?->name ?? '');
        $when = self::whenText($this->message->for_start_at ?? $b->start_at, $locale);
        $t = fn (string $key, array $replace = []) => __("client_messages.{$key}", $replace, $locale);

        // A move that kept the time changed only the person: say "changed", not "new time", and no "Previously".
        $previous = $kind === 'moved' && $this->message->previous_start_at ? $this->message->previous_start_at : null;
        $sameTime = $previous !== null && VenueClock::wall($previous) === VenueClock::wall($this->message->for_start_at ?? $b->start_at);
        $words = $sameTime ? 'changed' : $kind;

        $rows = [
            ['label' => $t('label.service'), 'value' => $service],
            ['label' => $t('label.when'), 'value' => $when],
        ];
        if ($previous !== null && !$sameTime) {
            $rows[] = ['label' => $t('label.previously'), 'value' => self::whenText($previous, $locale)];
        }
        if ($b->master?->name) {
            $rows[] = ['label' => $t('label.with'), 'value' => (string) $b->master->name];
        }
        $rows[] = ['label' => $t('label.reference'), 'value' => (string) $b->booking_reference];

        return [
            'subject'   => $t("subject.{$words}", ['service' => $service, 'venue' => $venue, 'when' => $when]),
            'headline'  => $t("headline.{$words}"),
            'greeting'  => $t('greeting', ['name' => (string) $b->customer_name]),
            'intro'     => $t("intro.{$words}", ['venue' => $venue]),
            'rows'      => $rows,
            'closing'   => $t($kind === 'cancelled' ? 'book_again' : 'questions'),
            // Part H §6.3: what a cancellation did to the booking-page deposit.
            'deposit'   => $kind === 'cancelled' ? self::depositLine($b, $t, $locale) : null,
            'venue'     => ['name' => $venue, 'address' => $org?->address ?: null, 'phone' => $org?->phone ?: null, 'email' => $org?->email ?: null],
            'hotelName' => $venue,
        ];
    }

    /**
     * Part H: what the money says, as the message is sent — card money given back (a refund in time, or a manager's
     * goodwill after a late cancellation) is "being refunded"; otherwise the window decides: in time the deposit goes
     * back (a hold released, or a refund still to make), late it is kept. Null for a booking without a deposit.
     */
    private static function depositLine(ServiceBooking $b, \Closure $t, string $locale): ?string
    {
        $d = Deposits::of($b);
        if ($d === null) {
            return null;
        }
        $currency = strtoupper((string) ($b->currency ?: 'EUR'));
        $money = fn (float $amount) => self::moneyText($amount, $currency, $locale);
        $back = AppointmentMoney::summary($b)['refunded_online'];
        if ($back > 0) {
            return $t('deposit.refunded', ['amount' => $money($back)]);
        }
        if (Deposits::inTime($b, $b->cancelled_at ?? now())) {
            return $t('deposit.refunded', ['amount' => $money($d['amount'])]);
        }

        // No hours agreed: the deadline was the start itself.
        return $d['cancel_hours'] === 0
            ? $t('deposit.kept_after_start', ['amount' => $money($d['amount'])])
            : $t('deposit.kept', ['amount' => $money($d['amount']), 'hours' => $d['cancel_hours']]);
    }

    /**
     * The amount the way the client's language writes money: "€12.00", "12,00 €". Where ext-intl is missing
     * (the app does not require it, see App\Landing\Money) it stays "EUR 12.00".
     */
    public static function moneyText(float $amount, string $currency, string $locale): string
    {
        if (class_exists(\NumberFormatter::class)) {
            $text = (new \NumberFormatter($locale, \NumberFormatter::CURRENCY))->formatCurrency($amount, $currency);
            if (is_string($text) && $text !== '') {
                return $text;
            }
        }

        return $currency . ' ' . number_format($amount, 2);
    }

    /** "Tuesday 6 October 2026, 10:00": the venue's own clock, in the words of the language. */
    public static function whenText(\DateTimeInterface|string $stored, string $locale): string
    {
        $wall = CarbonImmutable::createFromFormat('!' . VenueClock::WALL, (string) VenueClock::wall($stored), 'UTC')->locale($locale);

        return __('client_messages.when', [
            'date' => $wall->translatedFormat(__('client_messages.date_format', [], $locale)),
            'time' => $wall->format('H:i'),
        ], $locale);
    }
}
