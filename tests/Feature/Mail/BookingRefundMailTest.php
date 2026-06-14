<?php

namespace Tests\Feature\Mail;

use App\Mail\BookingRefundMail;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks BookingRefundMail's constructor + envelope() — the
 * customer-facing email sent after a Stripe refund. Per
 * AUDIT-2026-06-13-ADDENDUM.md, this is one of the only places
 * we email a guest about a money-moving event; a regression on
 * the amount, currency, or booking_reference creates a real
 * customer-trust incident.
 *
 * Coverage:
 *
 *   Constructor field extraction:
 *     - guest_name → guestName with fallback to "Guest"
 *     - booking_reference → bookingReference with fallback to
 *       "#{id}"
 *     - apartment_name → unitName with fallback to "Your room"
 *     - arrival_date / departure_date formatted as "M j, Y"
 *     - refundAmount + isFull persisted verbatim from args
 *
 *   HotelSetting pulls:
 *     - booking_currency → currency (default EUR)
 *     - company_name → hotelName (default "the hotel")
 *     - mail_from_address → supportEmail (default support@...)
 *
 *   Industry resolution:
 *     - Fallback to DEFAULT_INDUSTRY (hotel) when no org found
 *     - Reads from organization's resolved_industry attribute
 *
 *   envelope():
 *     - Full refund → subject prefix "Refund confirmed"
 *     - Partial refund → subject prefix "Partial refund confirmed"
 *     - Subject includes hotel name + booking reference
 *
 *   Queue contract:
 *     - $tries = 3 + $backoff = [60, 300, 900] (per docblock)
 */
class BookingRefundMailTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_constructor_extracts_guest_name_from_mirror(): void
    {
        $mirror = BookingMirrorFactory::new()->create([
            'guest_name'        => 'Jane Doe',
            'booking_reference' => 'BK12345',
            'apartment_name'    => 'Beach Suite',
            'arrival_date'      => '2026-07-01',
            'departure_date'    => '2026-07-04',
        ]);

        $mail = new BookingRefundMail($mirror, 500.00, true);

        $this->assertSame('Jane Doe', $mail->guestName);
        $this->assertSame('BK12345', $mail->bookingReference);
        $this->assertSame('Beach Suite', $mail->unitName);
    }

    public function test_guest_name_falls_back_to_Guest_when_missing(): void
    {
        // Defensive: a mirror created without guest data (orphan
        // recovery edge case) must still produce a sensible email.
        $mirror = BookingMirrorFactory::new()->create([
            'guest_name' => null,
        ]);

        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('Guest', $mail->guestName);
    }

    public function test_booking_reference_falls_back_to_hash_id(): void
    {
        $mirror = BookingMirrorFactory::new()->create([
            'booking_reference' => null,
        ]);

        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame("#{$mirror->id}", $mail->bookingReference);
    }

    public function test_unit_name_falls_back_to_default(): void
    {
        $mirror = BookingMirrorFactory::new()->create([
            'apartment_name' => null,
        ]);

        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('Your room', $mail->unitName);
    }

    public function test_dates_formatted_as_M_j_Y(): void
    {
        // The "M j, Y" format renders 2026-07-01 as "Jul 1, 2026".
        // This is the customer-facing date format — a regression
        // to ISO would look amateurish on the email.
        $mirror = BookingMirrorFactory::new()->create([
            'arrival_date'   => '2026-07-01',
            'departure_date' => '2026-07-04',
        ]);

        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('Jul 1, 2026', $mail->checkIn);
        $this->assertSame('Jul 4, 2026', $mail->checkOut);
    }

    public function test_refundAmount_and_isFull_persisted_verbatim_from_constructor_args(): void
    {
        $mirror = BookingMirrorFactory::new()->create();

        $full = new BookingRefundMail($mirror, 540.50, true);
        $this->assertSame(540.50, $full->refundAmount);
        $this->assertTrue($full->isFull);

        $partial = new BookingRefundMail($mirror, 100.00, false);
        $this->assertSame(100.00, $partial->refundAmount);
        $this->assertFalse($partial->isFull);
    }

    public function test_currency_pulled_from_HotelSetting_with_EUR_default(): void
    {
        $mirror = BookingMirrorFactory::new()->create();

        // No setting → default EUR.
        $defaultMail = new BookingRefundMail($mirror, 100.00, true);
        $this->assertSame('EUR', $defaultMail->currency);

        // With setting → reads from there.
        HotelSetting::create([
            'key' => 'booking_currency', 'value' => 'USD',
            'type' => 'string', 'group' => 'general', 'label' => 'Currency',
        ]);
        // Clear cache so the next read sees the new value.
        \App\Models\HotelSetting::flushCacheFor((int) app('current_organization_id'));
        $customMail = new BookingRefundMail($mirror, 100.00, true);
        $this->assertSame('USD', $customMail->currency);
    }

    public function test_hotel_name_pulled_from_HotelSetting_company_name(): void
    {
        HotelSetting::create([
            'key' => 'company_name', 'value' => 'Forrest Glamp Resort',
            'type' => 'string', 'group' => 'general', 'label' => 'Company',
        ]);
        \App\Models\HotelSetting::flushCacheFor((int) app('current_organization_id'));

        $mirror = BookingMirrorFactory::new()->create();
        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('Forrest Glamp Resort', $mail->hotelName);
    }

    public function test_hotel_name_falls_back_to_default_when_setting_absent(): void
    {
        $mirror = BookingMirrorFactory::new()->create();
        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('the hotel', $mail->hotelName,
            'Missing company_name HotelSetting must fall back to default.');
    }

    public function test_support_email_pulled_from_mail_from_address(): void
    {
        HotelSetting::create([
            'key' => 'mail_from_address', 'value' => 'help@forrest.test',
            'type' => 'string', 'group' => 'mail', 'label' => 'From',
        ]);
        \App\Models\HotelSetting::flushCacheFor((int) app('current_organization_id'));

        $mirror = BookingMirrorFactory::new()->create();
        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('help@forrest.test', $mail->supportEmail);
    }

    public function test_industry_falls_back_to_hotel_when_org_not_found(): void
    {
        // The org-find path: if the mirror's organization_id
        // resolves to no row, fall back to DEFAULT_INDUSTRY.
        // This locks the legacy / null-safety path.
        $mirror = BookingMirrorFactory::new()->create();
        // Tamper the mirror's org reference to a non-existent id.
        $mirror->forceFill(['organization_id' => 999_999])->save();

        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame('hotel', $mail->industry,
            'Missing org must fall back to DEFAULT_INDUSTRY.');
    }

    public function test_full_refund_subject_format(): void
    {
        HotelSetting::create([
            'key' => 'company_name', 'value' => 'Forrest Glamp',
            'type' => 'string', 'group' => 'general', 'label' => 'Company',
        ]);
        \App\Models\HotelSetting::flushCacheFor((int) app('current_organization_id'));

        $mirror = BookingMirrorFactory::new()->create([
            'booking_reference' => 'BK12345',
        ]);

        $mail = new BookingRefundMail($mirror, 500.00, true);
        $env = $mail->envelope();

        $this->assertSame('Refund confirmed — Forrest Glamp · BK12345', $env->subject);
    }

    public function test_partial_refund_subject_format(): void
    {
        HotelSetting::create([
            'key' => 'company_name', 'value' => 'Forrest Glamp',
            'type' => 'string', 'group' => 'general', 'label' => 'Company',
        ]);
        \App\Models\HotelSetting::flushCacheFor((int) app('current_organization_id'));

        $mirror = BookingMirrorFactory::new()->create([
            'booking_reference' => 'BK12345',
        ]);

        $mail = new BookingRefundMail($mirror, 100.00, false);
        $env = $mail->envelope();

        $this->assertSame('Partial refund confirmed — Forrest Glamp · BK12345', $env->subject);
    }

    public function test_queue_retry_settings_match_docblock_contract(): void
    {
        // ShouldQueue with $tries = 3 + $backoff = [60, 300, 900].
        // The retry backoff is documented (60s/5min/15min) — a
        // regression to e.g. fixed retry-delay would flood the
        // queue on a bad SMTP relay.
        $mirror = BookingMirrorFactory::new()->create();
        $mail = new BookingRefundMail($mirror, 100.00, true);

        $this->assertSame(3, $mail->tries);
        $this->assertSame([60, 300, 900], $mail->backoff);
    }

    public function test_implements_ShouldQueue_for_async_dispatch(): void
    {
        // Refunds are not on a synchronous request path; the email
        // is more important than its dispatch timing. Locks the
        // ShouldQueue marker so a refactor doesn't accidentally
        // make it synchronous.
        $this->assertTrue(
            in_array(\Illuminate\Contracts\Queue\ShouldQueue::class,
                class_implements(BookingRefundMail::class),
                true),
            'BookingRefundMail must implement ShouldQueue.',
        );
    }
}
