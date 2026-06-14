<?php

namespace Tests\Feature\Mail;

use App\Mail\BookingMembershipMail;
use Tests\TestCase;

/**
 * Locks BookingMembershipMail — the activation email sent to
 * guests who became members via a booking-flow loyalty signup.
 * Sister to BookingRefundMail + BookingConfirmationMail.
 *
 * Contract:
 *   - Pure constructor with public typed properties
 *   - supportEmail default ('support@hotel-tech.ai')
 *   - industry nullable — null falls through to hotel
 *   - envelope subject format: "Your {hotelName} Membership —
 *     Activate Your Account"
 */
class BookingMembershipMailTest extends TestCase
{
    private function makeMail(array $overrides = []): BookingMembershipMail
    {
        $defaults = [
            'guestName'    => 'Jane Doe',
            'hotelName'    => 'Forrest Glamp',
            'memberNumber' => 'M00012345',
            'tierName'     => 'Bronze',
            'email'        => 'jane@example.test',
            'code'         => 'ACT-ABC123',
        ];
        return new BookingMembershipMail(...array_merge($defaults, $overrides));
    }

    public function test_constructor_stores_required_fields_verbatim(): void
    {
        $mail = $this->makeMail();

        $this->assertSame('Jane Doe', $mail->guestName);
        $this->assertSame('Forrest Glamp', $mail->hotelName);
        $this->assertSame('M00012345', $mail->memberNumber);
        $this->assertSame('Bronze', $mail->tierName);
        $this->assertSame('jane@example.test', $mail->email);
        $this->assertSame('ACT-ABC123', $mail->code);
    }

    public function test_supportEmail_defaults_to_hotel_tech_address(): void
    {
        $mail = $this->makeMail();
        $this->assertSame('support@hotel-tech.ai', $mail->supportEmail);
    }

    public function test_industry_defaults_to_null_for_back_compat(): void
    {
        // Pre-Phase-8 call sites mustn't have to know about the
        // industry param. Null falls through to hotel framing
        // in content().
        $mail = $this->makeMail();
        $this->assertNull($mail->industry);
    }

    public function test_envelope_subject_format(): void
    {
        $mail = $this->makeMail(['hotelName' => 'Forrest Glamp Resort']);
        $env = $mail->envelope();

        $this->assertSame(
            'Your Forrest Glamp Resort Membership — Activate Your Account',
            $env->subject,
        );
    }

    public function test_envelope_subject_does_NOT_vary_by_industry(): void
    {
        // BookingMembershipMail keeps subject industry-agnostic
        // because medical orgs shouldn't reach this email at all
        // (decision #5: no patient loyalty program). The body
        // flexes via Blade content() with industry vocab, but
        // the subject stays canonical.
        $hotel = $this->makeMail(['industry' => 'hotel'])->envelope()->subject;
        $beauty = $this->makeMail(['industry' => 'beauty'])->envelope()->subject;

        $this->assertSame($hotel, $beauty,
            'Subject must NOT vary by industry — Membership emails are universal.');
    }

    public function test_member_number_in_email_is_distinct_for_each_member(): void
    {
        // Sanity: two members get distinct member_number fields
        // (this is the activation key downstream uses).
        $a = $this->makeMail(['memberNumber' => 'M001']);
        $b = $this->makeMail(['memberNumber' => 'M002']);

        $this->assertNotSame($a->memberNumber, $b->memberNumber);
    }
}
