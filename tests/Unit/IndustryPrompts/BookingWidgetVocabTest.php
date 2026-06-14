<?php

namespace Tests\Unit\IndustryPrompts;

use App\Services\IndustryPrompts\BookingWidgetVocab;
use PHPUnit\Framework\TestCase;

/**
 * Locks BookingWidgetVocab::for() — the static vocab map exposed
 * to the public booking widget via `window.WIDGET_VOCAB` (Phase 9
 * industry vocabulary ship).
 *
 * Why this matters:
 *
 *   - The widget's JS renderer expects a stable set of keys. A
 *     missing key shows as an empty string in production —
 *     headlines, button labels, step bars all silently blank.
 *
 *   - Hotel orgs MUST get the legacy English strings VERBATIM so
 *     existing customers see zero behaviour change.
 *
 *   - Beauty / Medical / Restaurant orgs get industry-appropriate
 *     copy. The audience-changing words ('Adults' → 'Diners',
 *     'Check-in' → 'Date') are the load-bearing pieces.
 *
 *   - Settings-only industries (legal / real_estate / fitness /
 *     education) fall through to hotel defaults today — they
 *     don't yet have GTM polish but MUST render coherent strings.
 *
 *   - The renderer's STEPS_NO_PAY / STEPS_PAY arrays depend on
 *     specific step counts. New steps added to the widget MUST
 *     update both the renderer AND every industry's profile.
 *
 * Pure-function test — no DB, no boot.
 */
class BookingWidgetVocabTest extends TestCase
{
    /* ─── Hotel = the legacy baseline (zero behaviour change) ─── */

    public function test_hotel_returns_legacy_english_strings_verbatim(): void
    {
        // Hotel orgs make up the majority of current production —
        // these strings MUST stay identical to pre-vocab-swap or
        // every customer notices a copy change overnight.
        $vocab = BookingWidgetVocab::for('hotel');

        $this->assertSame('Find Your Perfect Stay', $vocab['search_title']);
        $this->assertSame('Check-in', $vocab['check_in']);
        $this->assertSame('Check-out', $vocab['check_out']);
        $this->assertSame('Adults', $vocab['adults']);
        $this->assertSame('Search Rooms', $vocab['search_button']);
        $this->assertSame('Guest Details', $vocab['details_title']);
    }

    public function test_hotel_step_bar_arrays_match_renderer_expectations(): void
    {
        // The renderer's STEPS_NO_PAY array has 4 entries. STEPS_PAY
        // has 5 (adds Payment step). Length mismatch shifts every
        // step indicator off-by-one — UX disaster.
        $vocab = BookingWidgetVocab::for('hotel');

        $this->assertCount(4, $vocab['steps_no_pay'],
            'STEPS_NO_PAY MUST have 4 entries (renderer hardcoded).');
        $this->assertCount(5, $vocab['steps_pay'],
            'STEPS_PAY MUST have 5 entries (adds Payment).');
        $this->assertSame('Payment', end($vocab['steps_pay']),
            'Last step in STEPS_PAY MUST be Payment.');
    }

    /* ─── Beauty industry-specific noun swaps ─── */

    public function test_beauty_swaps_treatment_centric_nouns(): void
    {
        // Beauty industry vocabulary: 'treatment' is the universal
        // noun. Adults → Clients. Booking → Treatment.
        $vocab = BookingWidgetVocab::for('beauty');

        $this->assertSame('Book Your Treatment', $vocab['search_title']);
        $this->assertSame('Clients', $vocab['adults'],
            'Beauty industry MUST swap Adults→Clients.');
        $this->assertSame('Client Details', $vocab['details_title']);
        $this->assertSame('Search Treatments', $vocab['search_button']);
    }

    public function test_beauty_uses_date_not_check_in(): void
    {
        // Service industries (beauty/medical/restaurant) don't have
        // multi-night stays — 'Check-in'/'Check-out' would confuse.
        $vocab = BookingWidgetVocab::for('beauty');

        $this->assertSame('Date', $vocab['check_in']);
        $this->assertNotSame('Check-in', $vocab['check_in'],
            'Service industry MUST NOT use the hotel-flavoured "Check-in".');
    }

    /* ─── Medical industry-specific noun swaps ─── */

    public function test_medical_swaps_patient_centric_nouns(): void
    {
        $vocab = BookingWidgetVocab::for('medical');

        $this->assertSame('Patients', $vocab['adults'],
            'Medical industry MUST swap Adults→Patients (Phase 9 vocab lock).');
        $this->assertSame('Patient Details', $vocab['details_title']);
        $this->assertSame('Book Your Appointment', $vocab['search_title']);
    }

    public function test_medical_step_bars_say_patient_details(): void
    {
        // The pay-step bar's 4th entry is "Patient Details" (vs
        // hotel's "Guest Details"). Locks the step label even when
        // industries differ.
        $vocab = BookingWidgetVocab::for('medical');

        $this->assertSame(
            ['Date & Time', 'Appointment', 'Add-ons', 'Patient Details', 'Payment'],
            $vocab['steps_pay'],
        );
    }

    /* ─── Restaurant industry-specific noun swaps ─── */

    public function test_restaurant_swaps_diner_centric_nouns(): void
    {
        $vocab = BookingWidgetVocab::for('restaurant');

        $this->assertSame('Diners', $vocab['adults'],
            'Restaurant MUST swap Adults→Diners.');
        $this->assertSame('Diner Details', $vocab['details_title']);
        $this->assertSame('Reserve Your Table', $vocab['search_title']);
        $this->assertSame('Find Tables', $vocab['search_button']);
    }

    /* ─── Fallback for settings-only industries ─── */

    public function test_unknown_industry_falls_through_to_hotel_defaults(): void
    {
        // legal / real_estate / education / fitness today have no
        // GTM polish but MUST render coherent strings (defensive
        // default rather than empty).
        foreach (['legal', 'real_estate', 'fitness', 'education'] as $industry) {
            $vocab = BookingWidgetVocab::for($industry);

            $this->assertSame('Find Your Perfect Stay', $vocab['search_title'],
                "Industry '{$industry}' MUST fall through to hotel defaults today.");
            $this->assertSame('Check-in', $vocab['check_in']);
        }
    }

    public function test_completely_unknown_industry_string_falls_through(): void
    {
        // A typo or new industry id MUST NOT yield an empty array
        // — settings-only fallthrough is the documented safety net.
        $vocab = BookingWidgetVocab::for('extraterrestrial_lodging');

        $this->assertNotEmpty($vocab);
        $this->assertArrayHasKey('search_title', $vocab);
        $this->assertSame('Find Your Perfect Stay', $vocab['search_title']);
    }

    /* ─── Key-set integrity across industries ─── */

    public function test_every_industry_returns_the_same_key_set(): void
    {
        // CRITICAL: missing a key means the JS renderer surfaces
        // an empty string at runtime. Every industry MUST return
        // EXACTLY the same key set as hotel — adding a new key in
        // hotel without adding it everywhere is the canonical bug
        // this test catches.
        $hotelKeys = array_keys(BookingWidgetVocab::for('hotel'));
        sort($hotelKeys);

        foreach (['beauty', 'medical', 'restaurant'] as $industry) {
            $industryKeys = array_keys(BookingWidgetVocab::for($industry));
            sort($industryKeys);

            $this->assertSame($hotelKeys, $industryKeys,
                "Industry '{$industry}' MUST return the same key set as hotel " .
                "(adding a key in hotel without backfilling " .
                "industry-specific profiles yields empty strings in the widget).");
        }
    }

    public function test_every_industry_carries_all_step_bar_keys(): void
    {
        // The two step-bar arrays AND the related label keys are
        // load-bearing for the widget's progress indicator. Lock
        // them across every industry.
        $required = [
            'steps_no_pay', 'steps_pay',
            'search_title', 'search_sub',
            'extras_title', 'details_title',
            'check_in', 'check_out', 'adults', 'children', 'select_date',
            'search_button', 'searching', 'continue', 'continue_payment',
            // Services widget specifics
            'svc_service_title',  'svc_service_sub',
            'svc_provider_title', 'svc_provider_sub',
            'svc_details_title',  'svc_details_sub',
        ];

        foreach (['hotel', 'beauty', 'medical', 'restaurant'] as $industry) {
            $vocab = BookingWidgetVocab::for($industry);

            foreach ($required as $key) {
                $this->assertArrayHasKey($key, $vocab,
                    "Industry '{$industry}' MUST carry '{$key}'.");
                $this->assertNotEmpty($vocab[$key],
                    "Industry '{$industry}' carries '{$key}' but value is empty — " .
                    "renderer would show a blank label/button.");
            }
        }
    }

    /* ─── Cross-industry distinctness sanity ─── */

    public function test_industry_step_labels_actually_differ_per_industry(): void
    {
        // Defensive: a regression that swallows the per-industry
        // map (e.g. `case 'beauty' => $defaults;`) would silently
        // collapse every industry to hotel. Lock that the steps
        // ARE distinct.
        $hotel      = BookingWidgetVocab::for('hotel')['steps_no_pay'];
        $beauty     = BookingWidgetVocab::for('beauty')['steps_no_pay'];
        $medical    = BookingWidgetVocab::for('medical')['steps_no_pay'];
        $restaurant = BookingWidgetVocab::for('restaurant')['steps_no_pay'];

        $unique = array_unique([
            json_encode($hotel), json_encode($beauty),
            json_encode($medical), json_encode($restaurant),
        ]);
        $this->assertCount(4, $unique,
            'All 4 industries MUST have DISTINCT step bars (regression-guard against silent collapse to hotel).');
    }

    public function test_svc_provider_title_reflects_industry_practitioner_noun(): void
    {
        // Services widget's "Choose your provider" step has the
        // most industry-specific weight. Lock the verbiage on the
        // title (the noun in the headline).
        $this->assertSame('Choose your provider',
            BookingWidgetVocab::for('hotel')['svc_provider_title'],
            'Hotel keeps the generic "provider" headline.');
        $this->assertStringContainsString('stylist',
            BookingWidgetVocab::for('beauty')['svc_provider_title'],
            'Beauty MUST mention stylist/therapist.');
        $this->assertStringContainsString('practitioner',
            BookingWidgetVocab::for('medical')['svc_provider_title'],
            'Medical MUST mention practitioner.');
        // Restaurant uses 'section' (table seating) not provider
        $this->assertStringContainsString('section',
            BookingWidgetVocab::for('restaurant')['svc_provider_title'],
            'Restaurant MUST switch to "section" (table seating).');
    }
}
