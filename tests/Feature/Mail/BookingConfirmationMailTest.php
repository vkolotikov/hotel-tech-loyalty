<?php

namespace Tests\Feature\Mail;

use App\Mail\BookingConfirmationMail;
use Tests\TestCase;

/**
 * Locks BookingConfirmationMail's constructor + envelope contract
 * — the guest-facing post-booking email. Sister to
 * BookingRefundMail (already covered).
 *
 * Key differences from Refund:
 *   - Pure constructor — fields are passed in verbatim (NOT
 *     derived from a BookingMirror), so the caller is responsible
 *     for formatting dates / pulling HotelSetting / etc.
 *   - Industry-aware subject: hotel + restaurant → "Booking
 *     Confirmed"; beauty + medical → "Appointment Confirmed"
 *   - Industry NULL falls through to hotel framing (back-compat
 *     for pre-Phase-8 call sites)
 *
 * Coverage:
 *
 *   Constructor field defaults:
 *     - extras + policies default to empty arrays
 *     - All optional fields (~25 of them) default to null —
 *       Blade renders sections conditionally
 *
 *   envelope() industry vocabulary:
 *     - 'hotel' → "Booking Confirmed"
 *     - 'restaurant' → "Booking Confirmed" (table bookings stay
 *       as "bookings" — the locked phase-8 decision)
 *     - 'beauty' → "Appointment Confirmed"
 *     - 'medical' → "Appointment Confirmed"
 *     - null → "Booking Confirmed" (legacy back-compat)
 *
 *   Subject format always includes hotel name + check-in date
 */
class BookingConfirmationMailTest extends TestCase
{
    /** Build a complete mailable with all required fields filled in. */
    private function makeMail(array $overrides = []): BookingConfirmationMail
    {
        $defaults = [
            'guestName'        => 'Jane Doe',
            'hotelName'        => 'Forrest Glamp',
            'bookingReference' => 'BK12345',
            'unitName'         => 'Forest Cabin',
            'checkIn'          => 'Jul 1, 2026',
            'checkOut'         => 'Jul 4, 2026',
            'nights'           => 3,
            'adults'           => 2,
            'children'         => 0,
            'roomTotal'        => 450.00,
            'extrasTotal'      => 50.00,
            'grossTotal'       => 500.00,
            'currency'         => 'EUR',
            'pricePerNight'    => 150.00,
        ];
        $args = array_merge($defaults, $overrides);

        return new BookingConfirmationMail(...$args);
    }

    public function test_required_fields_passed_to_constructor_are_stored_verbatim(): void
    {
        $mail = $this->makeMail();

        $this->assertSame('Jane Doe', $mail->guestName);
        $this->assertSame('Forrest Glamp', $mail->hotelName);
        $this->assertSame('BK12345', $mail->bookingReference);
        $this->assertSame('Forest Cabin', $mail->unitName);
        $this->assertSame('Jul 1, 2026', $mail->checkIn);
        $this->assertSame('Jul 4, 2026', $mail->checkOut);
        $this->assertSame(3, $mail->nights);
        $this->assertSame(2, $mail->adults);
        $this->assertSame(0, $mail->children);
        $this->assertSame(450.00, $mail->roomTotal);
        $this->assertSame(50.00, $mail->extrasTotal);
        $this->assertSame(500.00, $mail->grossTotal);
        $this->assertSame('EUR', $mail->currency);
        $this->assertSame(150.00, $mail->pricePerNight);
    }

    public function test_extras_defaults_to_empty_array(): void
    {
        // Blade renders the extras section conditionally on
        // empty($extras). Locking the default avoids a "null
        // is not array" Blade crash on legacy call sites.
        $mail = $this->makeMail();

        $this->assertSame([], $mail->extras);
        $this->assertSame([], $mail->policies);
    }

    public function test_default_supportEmail(): void
    {
        $mail = $this->makeMail();

        $this->assertSame('support@hotel-tech.ai', $mail->supportEmail);
    }

    public function test_optional_payment_fields_default_to_null(): void
    {
        // The Blade renders the payment-card section ONLY when
        // paymentStatus is non-null. Locking null defaults
        // means legacy callers (orphan recovery, retry crons) get
        // a zero-section email rather than a Blade error.
        $mail = $this->makeMail();

        $this->assertNull($mail->paymentMethod);
        $this->assertNull($mail->paymentBrand);
        $this->assertNull($mail->paymentLast4);
        $this->assertNull($mail->paymentStatus);
        $this->assertNull($mail->paymentReference);
        $this->assertNull($mail->receiptUrl);
    }

    public function test_optional_guest_contact_fields_default_to_null(): void
    {
        $mail = $this->makeMail();

        $this->assertNull($mail->guestEmail);
        $this->assertNull($mail->guestPhone);
        $this->assertNull($mail->guestAddress);
        $this->assertNull($mail->bookingDate);
        $this->assertNull($mail->arrivalTime);
        $this->assertNull($mail->specialRequests);
    }

    public function test_optional_branding_fields_default_to_null(): void
    {
        $mail = $this->makeMail();

        $this->assertNull($mail->brandLogoUrl);
        $this->assertNull($mail->brandPrimaryColor);
        $this->assertNull($mail->contactPhone);
        $this->assertNull($mail->hotelAddress);
    }

    public function test_industry_defaults_to_null_for_back_compat(): void
    {
        // The phase-8 industry param is NULLABLE — pre-phase-8
        // call sites mustn't have to know about it. Null routes
        // through the hotel framing path.
        $mail = $this->makeMail();

        $this->assertNull($mail->industry);
    }

    public function test_envelope_subject_for_hotel_industry(): void
    {
        // Hotel default — "Booking Confirmed" is the canonical
        // English back-compat phrasing.
        $mail = $this->makeMail(['industry' => 'hotel']);
        $env = $mail->envelope();

        $this->assertSame(
            'Booking Confirmed — Forrest Glamp (Jul 1, 2026)',
            $env->subject,
        );
    }

    public function test_envelope_subject_for_restaurant_industry(): void
    {
        // The locked Phase-8 decision: restaurant table bookings
        // STILL read as "bookings", not "appointments". Lock this
        // so a future change doesn't accidentally relabel it.
        $mail = $this->makeMail([
            'industry' => 'restaurant',
            'hotelName' => 'Trattoria Roma',
        ]);
        $env = $mail->envelope();

        $this->assertSame(
            'Booking Confirmed — Trattoria Roma (Jul 1, 2026)',
            $env->subject,
            'Restaurant industry must stay on "Booking Confirmed" — not "Appointment".',
        );
    }

    public function test_envelope_subject_for_beauty_industry(): void
    {
        $mail = $this->makeMail([
            'industry' => 'beauty',
            'hotelName' => 'The Gloss Atelier',
        ]);
        $env = $mail->envelope();

        $this->assertSame(
            'Appointment Confirmed — The Gloss Atelier (Jul 1, 2026)',
            $env->subject,
        );
    }

    public function test_envelope_subject_for_medical_industry(): void
    {
        $mail = $this->makeMail([
            'industry' => 'medical',
            'hotelName' => 'Lakeside Wellness Clinic',
        ]);
        $env = $mail->envelope();

        $this->assertSame(
            'Appointment Confirmed — Lakeside Wellness Clinic (Jul 1, 2026)',
            $env->subject,
        );
    }

    public function test_envelope_subject_for_null_industry_falls_through_to_hotel(): void
    {
        // Legacy call site / pre-Phase-8 path: null industry must
        // default to "Booking Confirmed" (matches the docblock's
        // "zero behaviour change for pre-Phase-8 call sites").
        $mail = $this->makeMail(['industry' => null]);
        $env = $mail->envelope();

        $this->assertSame(
            'Booking Confirmed — Forrest Glamp (Jul 1, 2026)',
            $env->subject,
        );
    }

    public function test_envelope_subject_for_unknown_industry_falls_through_to_hotel(): void
    {
        // Defensive: an industry id we don't recognise (e.g. a
        // future industry whose label hasn't been added yet) must
        // NOT crash — match-arm default = "Booking Confirmed".
        $mail = $this->makeMail(['industry' => 'extraterrestrial_lodging']);
        $env = $mail->envelope();

        $this->assertSame(
            'Booking Confirmed — Forrest Glamp (Jul 1, 2026)',
            $env->subject,
        );
    }

    public function test_envelope_subject_always_includes_hotel_name_and_checkIn_date(): void
    {
        // Format invariant: subject is "{Noun} — {hotelName}
        // ({checkIn})" regardless of industry. Lock the spaces +
        // em-dash + parentheses formatting so a refactor can't
        // silently change inbox preview text.
        $mail = $this->makeMail([
            'hotelName' => 'My Special Hotel',
            'checkIn'   => 'Dec 25, 2026',
        ]);
        $env = $mail->envelope();

        $this->assertStringContainsString('My Special Hotel', $env->subject);
        $this->assertStringContainsString('Dec 25, 2026', $env->subject);
        // Format: noun, em-dash, hotel, space-paren, date, close-paren
        $this->assertMatchesRegularExpression(
            '/^Booking Confirmed — My Special Hotel \(Dec 25, 2026\)$/',
            $env->subject,
        );
    }

    public function test_explicit_extras_array_is_stored_verbatim(): void
    {
        // Caller-supplied extras render as a line-item list. Lock
        // the round-trip so a structure change in the array shape
        // doesn't get silently mangled.
        $extras = [
            ['name' => 'Airport transfer', 'price' => 50.00, 'qty' => 1],
            ['name' => 'Late checkout',    'price' => 25.00, 'qty' => 1],
        ];
        $mail = $this->makeMail(['extras' => $extras]);

        $this->assertSame($extras, $mail->extras);
    }
}
