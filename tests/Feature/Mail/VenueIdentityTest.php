<?php

namespace Tests\Feature\Mail;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\MailIdentityService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Guest-facing mail must carry the VENUE's identity, not the platform's.
 *
 * Before this, a guest booking a table received their confirmation from
 * "Hotel Loyalty" <noreply@hotel-tech.ai> — a brand they had never heard of.
 * That is a spam-report magnet, and complaints are the single most damaging
 * signal a mailbox provider receives, on a domain every tenant shares.
 *
 * Two properties are load-bearing and easy to break later:
 *
 *  1. The From ADDRESS stays on the platform domain. SPF/DKIM are published
 *     there; sending as an unverified tenant domain fails DMARC alignment and
 *     makes deliverability WORSE while looking like an improvement.
 *  2. The org is captured at CONSTRUCTION. These Mailables are queued, and
 *     envelope() runs in a worker where no org is bound — resolving lazily
 *     would silently produce the platform identity, or another tenant's.
 */
class VenueIdentityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasTable('organizations')) {
            Schema::create('organizations', function (Blueprint $t) {
                $t->id();
                $t->string('name')->nullable();
                $t->string('email')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('key');
                $t->text('value')->nullable();
                $t->timestamps();
            });
        }

        Organization::withoutGlobalScopes()->forceDelete();
        HotelSetting::withoutGlobalScopes()->forceDelete();
        config(['mail.from.address' => 'noreply@hotel-tech.ai']);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        parent::tearDown();
    }

    private function org(array $attrs = []): Organization
    {
        $o = new Organization();
        $o->forceFill(array_merge(['name' => 'The Tasting Room', 'email' => null], $attrs));
        $o->save();
        return $o;
    }

    private function identity(?int $orgId): array
    {
        // A fresh instance each time — the service caches per request.
        return (new MailIdentityService())->forOrganization($orgId);
    }

    public function test_the_venue_name_becomes_the_sender_name(): void
    {
        $org = $this->org();

        $identity = $this->identity($org->id);

        $this->assertSame('The Tasting Room', $identity['from_name'],
            "A venue that has configured nothing should still send under its own name.");
    }

    public function test_the_from_address_stays_on_the_platform_domain(): void
    {
        $org = $this->org(['email' => 'bookings@tastingroom.example']);

        $identity = $this->identity($org->id);

        $this->assertSame('noreply@hotel-tech.ai', $identity['from_address'],
            'Sending from an unverified tenant domain fails DMARC alignment and makes '
            . 'deliverability worse. Only the display name may change.');
    }

    public function test_replies_go_to_the_venue(): void
    {
        $org = $this->org(['email' => 'bookings@tastingroom.example']);

        $this->assertSame('bookings@tastingroom.example', $this->identity($org->id)['reply_to'],
            'Reply-To carries no authentication requirement, so it can be the venue today — '
            . 'otherwise a guest replying reaches an unread noreply mailbox.');
    }

    public function test_an_explicit_setting_overrides_the_org_name(): void
    {
        $org = $this->org();
        // forceFill, not create(): organization_id is absent from
        // HotelSetting::$fillable, so mass assignment silently drops it and the
        // row lands against the wrong tenant (or none).
        $row = new HotelSetting();
        $row->forceFill([
            'organization_id' => $org->id,
            'key'             => MailIdentityService::KEY_FROM_NAME,
            'value'           => 'Tasting Room Reservations',
        ])->save();

        $this->assertSame('Tasting Room Reservations', $this->identity($org->id)['from_name']);
    }

    public function test_a_malformed_reply_to_is_dropped_not_sent(): void
    {
        $org = $this->org();
        $row = new HotelSetting();
        $row->forceFill([
            'organization_id' => $org->id,
            'key'             => MailIdentityService::KEY_REPLY_TO,
            'value'           => 'not-an-email-address',
        ])->save();

        $this->assertNull($this->identity($org->id)['reply_to'],
            'Some providers reject a whole message on a malformed header rather than ignoring it.');
    }

    public function test_no_org_falls_back_to_platform_identity(): void
    {
        $identity = $this->identity(null);

        $this->assertNull($identity['from_name'],
            'Platform mail (signup codes, trial welcome) must not acquire a venue name.');
        $this->assertNull($identity['reply_to']);
        $this->assertSame('noreply@hotel-tech.ai', $identity['from_address']);
    }

    public function test_an_unknown_org_id_does_not_throw(): void
    {
        $identity = $this->identity(999999);

        $this->assertNull($identity['from_name']);
        $this->assertSame('noreply@hotel-tech.ai', $identity['from_address']);
    }

    /* ─── the capture-at-construction contract ─── */

    public function test_the_trait_captures_the_org_at_construction(): void
    {
        $org = $this->org();
        app()->instance('current_organization_id', $org->id);

        // An anonymous Mailable using the trait: this asserts the CONTRACT
        // rather than any one Mailable's constructor signature, which would
        // make the test brittle for no added confidence.
        $mail = new class extends \Illuminate\Mail\Mailable {
            use \App\Mail\Concerns\SendsAsVenue;

            public function __construct()
            {
                $this->captureVenue();
            }
        };

        // Simulate the queue: by the time the worker renders the envelope, the
        // org binding is gone.
        app()->forgetInstance('current_organization_id');

        $this->assertSame($org->id, $mail->venueOrgId,
            'The org must travel with the serialized Mailable — envelope() runs in a worker '
            . 'where nothing is bound, so lazy resolution would silently lose the venue.');
    }

    public function test_every_guest_facing_mailable_uses_the_trait(): void
    {
        // The classes a guest or member actually receives. Platform mail
        // (verification codes, trial welcome, staff invites) is deliberately
        // absent — those come FROM the product, not from a venue.
        foreach ([
            \App\Mail\BookingConfirmationMail::class,
            \App\Mail\BookingMembershipMail::class,
            \App\Mail\ServiceBookingConfirmationMail::class,
            \App\Mail\BookingRefundMail::class,
            \App\Mail\WelcomeMemberMail::class,
        ] as $class) {
            $this->assertContains(
                \App\Mail\Concerns\SendsAsVenue::class,
                class_uses_recursive($class),
                "{$class} reaches a guest, so it must send under the venue's name.",
            );
        }
    }
}
