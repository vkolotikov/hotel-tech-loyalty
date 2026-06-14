<?php

namespace Tests\Feature\Mail;

use App\Mail\WelcomeTrialMail;
use Tests\TestCase;

/**
 * Locks WelcomeTrialMail — the trial-signup welcome email sent
 * after a new org signs up for HexaTech.
 *
 * Critical contract: INDUSTRY_BRAND map maps each industry id to
 * its consumer-facing sub-brand string surfaced in the email
 * subject. Per the docblock's "Phase 8 reviewer fix": the four
 * Settings-only industries (legal / real_estate / education /
 * fitness) had no sub-brand mapping and were falling back to
 * 'HotelTechAI' via array-default lookup — so a legal firm
 * received "Welcome to HotelTechAI" which misled them about
 * which sub-brand they signed up under. Fix routes them through
 * 'HexaTech' (the umbrella parent brand).
 *
 * Coverage:
 *
 *   Constructor defaults:
 *     - docsUrl + supportEmail have documented defaults
 *     - industry nullable for legacy call sites
 *
 *   INDUSTRY_BRAND mapping per industry:
 *     - hotel → HotelTechAI (canonical default)
 *     - beauty → BeautyTech.uk
 *     - medical → MedTechAI
 *     - restaurant → HospitalityTech
 *     - legal → HexaTech (Phase 8 reviewer fix)
 *     - real_estate → HexaTech
 *     - education → HexaTech
 *     - fitness → HexaTech
 *     - null industry → HotelTechAI (legacy back-compat)
 *     - unknown industry → HotelTechAI (defensive default)
 *
 *   Subject format: "Welcome to {brand} — your {planName}
 *   trial is active!"
 */
class WelcomeTrialMailTest extends TestCase
{
    private function makeMail(array $overrides = []): WelcomeTrialMail
    {
        $defaults = [
            'userName'  => 'Jane Owner',
            'hotelName' => 'Forrest Glamp',
            'planName'  => 'Growth',
            'trialDays' => 14,
            'loginUrl'  => 'https://loyalty.hotel-tech.ai/login',
        ];
        return new WelcomeTrialMail(...array_merge($defaults, $overrides));
    }

    /* ─── Constructor defaults ─────────────────────────────── */

    public function test_constructor_stores_required_fields(): void
    {
        $mail = $this->makeMail();

        $this->assertSame('Jane Owner', $mail->userName);
        $this->assertSame('Forrest Glamp', $mail->hotelName);
        $this->assertSame('Growth', $mail->planName);
        $this->assertSame(14, $mail->trialDays);
        $this->assertSame('https://loyalty.hotel-tech.ai/login', $mail->loginUrl);
    }

    public function test_docsUrl_default(): void
    {
        $mail = $this->makeMail();
        $this->assertSame('https://hotel-tech.ai/docs', $mail->docsUrl);
    }

    public function test_supportEmail_default(): void
    {
        $mail = $this->makeMail();
        $this->assertSame('support@hotel-tech.ai', $mail->supportEmail);
    }

    public function test_industry_defaults_to_null_for_legacy_call_sites(): void
    {
        $mail = $this->makeMail();
        $this->assertNull($mail->industry);
    }

    /* ─── INDUSTRY_BRAND map — the load-bearing invariant ─── */

    public function test_envelope_subject_hotel_industry_uses_HotelTechAI(): void
    {
        $mail = $this->makeMail(['industry' => 'hotel']);
        $env = $mail->envelope();

        $this->assertSame(
            'Welcome to HotelTechAI — your Growth trial is active!',
            $env->subject,
        );
    }

    public function test_envelope_subject_beauty_uses_BeautyTech_uk(): void
    {
        $mail = $this->makeMail(['industry' => 'beauty']);
        $env = $mail->envelope();

        $this->assertSame(
            'Welcome to BeautyTech.uk — your Growth trial is active!',
            $env->subject,
        );
    }

    public function test_envelope_subject_medical_uses_MedTechAI(): void
    {
        $mail = $this->makeMail(['industry' => 'medical']);
        $env = $mail->envelope();

        $this->assertSame(
            'Welcome to MedTechAI — your Growth trial is active!',
            $env->subject,
        );
    }

    public function test_envelope_subject_restaurant_uses_HospitalityTech(): void
    {
        $mail = $this->makeMail(['industry' => 'restaurant']);
        $env = $mail->envelope();

        $this->assertSame(
            'Welcome to HospitalityTech — your Growth trial is active!',
            $env->subject,
        );
    }

    /* ─── Phase 8 reviewer fix: settings-only → HexaTech ─── */

    public function test_envelope_subject_legal_uses_HexaTech(): void
    {
        // CRITICAL Phase 8 reviewer fix: pre-fix, legal industry
        // fell back via array-default to 'HotelTechAI' — a legal
        // firm received "Welcome to HotelTechAI" which misled
        // them about which sub-brand they signed up under. Fix
        // routes through 'HexaTech' (umbrella parent brand).
        $mail = $this->makeMail(['industry' => 'legal']);
        $env = $mail->envelope();

        $this->assertSame(
            'Welcome to HexaTech — your Growth trial is active!',
            $env->subject,
            'Legal industry MUST route through HexaTech, NOT HotelTechAI (Phase 8 reviewer fix).',
        );
    }

    public function test_envelope_subject_real_estate_uses_HexaTech(): void
    {
        $mail = $this->makeMail(['industry' => 'real_estate']);
        $env = $mail->envelope();

        $this->assertStringContainsString('HexaTech', $env->subject);
        $this->assertStringNotContainsString('HotelTechAI', $env->subject);
    }

    public function test_envelope_subject_education_uses_HexaTech(): void
    {
        $mail = $this->makeMail(['industry' => 'education']);
        $env = $mail->envelope();

        $this->assertStringContainsString('HexaTech', $env->subject);
        $this->assertStringNotContainsString('HotelTechAI', $env->subject);
    }

    public function test_envelope_subject_fitness_uses_HexaTech(): void
    {
        $mail = $this->makeMail(['industry' => 'fitness']);
        $env = $mail->envelope();

        $this->assertStringContainsString('HexaTech', $env->subject);
        $this->assertStringNotContainsString('HotelTechAI', $env->subject);
    }

    /* ─── Fallbacks ─────────────────────────────────────── */

    public function test_envelope_subject_null_industry_falls_through_to_HotelTechAI(): void
    {
        // Legacy back-compat: pre-Phase-8 call sites that don't
        // pass industry get the hotel-default brand.
        $mail = $this->makeMail(['industry' => null]);
        $env = $mail->envelope();

        $this->assertStringContainsString('HotelTechAI', $env->subject);
    }

    public function test_envelope_subject_unknown_industry_falls_through_to_HotelTechAI(): void
    {
        // Defensive: an industry id we don't recognise must NOT
        // crash — fall back to the canonical default.
        $mail = $this->makeMail(['industry' => 'extraterrestrial_lodging']);
        $env = $mail->envelope();

        $this->assertStringContainsString('HotelTechAI', $env->subject);
    }

    /* ─── Subject format invariants ─────────────────────── */

    public function test_subject_includes_plan_name_verbatim(): void
    {
        // The planName field surfaces verbatim in the subject —
        // a member who signed up for Enterprise sees "Enterprise"
        // not "growth" (case-sensitive).
        $enterprise = $this->makeMail(['planName' => 'Enterprise'])->envelope()->subject;
        $this->assertStringContainsString('Enterprise trial', $enterprise);
    }

    public function test_subject_format_is_consistent_across_industries(): void
    {
        // The brand changes, but the format pattern ("Welcome to
        // {brand} — your {plan} trial is active!") stays identical.
        // Lock the punctuation + spacing.
        $formats = [];
        foreach (['hotel', 'beauty', 'medical', 'restaurant', 'legal'] as $industry) {
            $subject = $this->makeMail(['industry' => $industry])->envelope()->subject;
            // Replace the brand with placeholder to check pattern.
            $formats[] = preg_replace(
                '/Welcome to .+? — your/',
                'Welcome to {BRAND} — your',
                $subject,
            );
        }

        $unique = array_unique($formats);
        $this->assertCount(1, $unique,
            'Subject format must be IDENTICAL pattern across all industries.');
    }
}
