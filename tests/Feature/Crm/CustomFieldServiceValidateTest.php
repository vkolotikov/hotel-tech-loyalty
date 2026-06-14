<?php

namespace Tests\Feature\Crm;

use App\Models\CustomField;
use App\Services\CustomFieldService;
use Database\Factories\CustomFieldFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the CustomFieldService::validate() type-aware coercion
 * contract. Used by every CRUD endpoint on inquiries / guests /
 * corporate accounts / tasks via the `custom_data` jsonb column.
 *
 * Why this surface is high-value:
 *   - It's the only gate between an admin-typed string and the
 *     entity's persisted jsonb. A regression here means free-form
 *     payload reaches the DB unsanitised.
 *   - Each type's coercion is subtly different: number preserves
 *     int-vs-float, date round-trips to ISO8601, select gates
 *     against the configured options, multiselect dedupes.
 *   - The required-field gate must throw ValidationException so
 *     callers get the standard 422 + errors payload shape.
 *
 * Coverage: 10 supported types + required/empty/null handling +
 * unknown-key drop + active-only filtering + the "no schema, drop
 * everything silently" branch.
 */
class CustomFieldServiceValidateTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private CustomFieldService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCustomFieldsSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service = new CustomFieldService();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_text_type_coerces_to_string(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('text')->withKey('notes')->create();

        $out = $this->service->validate('inquiry', ['notes' => 'Late check-in']);

        $this->assertSame(['notes' => 'Late check-in'], $out);
    }

    public function test_textarea_type_coerces_to_string(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('textarea')->withKey('details')->create();

        $out = $this->service->validate('inquiry', ['details' => "line one\nline two"]);

        $this->assertSame(["details" => "line one\nline two"], $out);
    }

    public function test_number_preserves_int_vs_float(): void
    {
        // The cast `($raw + 0)` preserves int when input is int and
        // float when input is float. Without this, integer admin
        // entries would land in jsonb as floats — small visual issue
        // but breaks equality checks downstream.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('number')->withKey('party_size')->create();
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('number')->withKey('amount')->create();

        $out = $this->service->validate('inquiry', [
            'party_size' => '5',
            'amount'     => '12.50',
        ]);

        $this->assertSame(5, $out['party_size'], 'Integer string must cast to int.');
        $this->assertSame(12.5, $out['amount'], 'Decimal string must cast to float.');
    }

    public function test_number_rejects_non_numeric_input_with_validation_exception(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('number')
            ->withKey('budget')->create(['label' => 'Budget']);

        try {
            $this->service->validate('inquiry', ['budget' => 'lots']);
            $this->fail('Non-numeric input must throw ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.budget', $e->errors());
            $this->assertStringContainsString('Budget must be a number', $e->errors()['custom_data.budget'][0]);
        }
    }

    public function test_date_round_trips_through_iso8601(): void
    {
        // Admin enters "2026-07-01" → must round-trip to an ISO8601
        // string. Frontend decides the display format from there.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('date')->withKey('arrival')->create();

        $out = $this->service->validate('inquiry', ['arrival' => '2026-07-01']);

        $this->assertMatchesRegularExpression(
            '/^2026-07-01T\d{2}:\d{2}:\d{2}[\+\-]\d{2}:\d{2}$/',
            $out['arrival'],
            'Date must normalise to ISO8601.',
        );
    }

    public function test_date_rejects_invalid_string_with_validation_exception(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('date')
            ->withKey('contract_end')->create(['label' => 'Contract end']);

        try {
            $this->service->validate('inquiry', ['contract_end' => 'not-a-date-at-all']);
            $this->fail('Unparseable date input must throw ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.contract_end', $e->errors());
            $this->assertStringContainsString(
                'must be a valid date',
                $e->errors()['custom_data.contract_end'][0],
            );
        }
    }

    public function test_checkbox_coerces_to_boolean(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('checkbox')->withKey('vip')->create();

        $out1 = $this->service->validate('inquiry', ['vip' => '1']);
        $out2 = $this->service->validate('inquiry', ['vip' => true]);

        $this->assertTrue($out1['vip']);
        $this->assertTrue($out2['vip']);
    }

    public function test_select_accepts_a_configured_option(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType(
            'select',
            ['options' => ['Direct', 'OTA', 'Walk-in']],
        )->withKey('source')->create();

        $out = $this->service->validate('inquiry', ['source' => 'OTA']);

        $this->assertSame('OTA', $out['source']);
    }

    public function test_select_rejects_a_value_not_in_options(): void
    {
        // The whitelist guard: select fields MUST reject values not
        // in their config.options. Without this, an attacker can
        // inject any string by hitting the /custom_data update
        // endpoint with a non-option payload.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType(
            'select',
            ['options' => ['Bronze', 'Silver', 'Gold']],
        )->withKey('tier_pref')->create(['label' => 'Tier preference']);

        try {
            $this->service->validate('inquiry', ['tier_pref' => 'Platinum']);
            $this->fail('Off-options value must throw ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.tier_pref', $e->errors());
        }
    }

    public function test_multiselect_dedupes_and_returns_array(): void
    {
        // Two contract checks: input must be array, output must be
        // a unique-deduped, re-indexed (array_values) list. Without
        // re-indexing, jsonb storage would preserve gaps and that
        // downstream code reading it as a list would see holes.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType(
            'multiselect',
            ['options' => ['gym', 'spa', 'pool']],
        )->withKey('amenities')->create();

        $out = $this->service->validate('inquiry', [
            'amenities' => ['gym', 'spa', 'gym'],
        ]);

        $this->assertSame(['gym', 'spa'], $out['amenities']);
    }

    public function test_multiselect_rejects_non_array_input(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType(
            'multiselect',
            ['options' => ['a', 'b']],
        )->withKey('tags')->create(['label' => 'Tags']);

        try {
            $this->service->validate('inquiry', ['tags' => 'not-an-array']);
            $this->fail('Non-array input to multiselect must throw.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.tags', $e->errors());
            $this->assertStringContainsString('must be a list', $e->errors()['custom_data.tags'][0]);
        }
    }

    public function test_multiselect_rejects_unknown_option_in_list(): void
    {
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType(
            'multiselect',
            ['options' => ['gym', 'spa', 'pool']],
        )->withKey('amenities')->create(['label' => 'Amenities']);

        try {
            $this->service->validate('inquiry', [
                'amenities' => ['gym', 'helipad'],
            ]);
            $this->fail('Unknown option in multiselect list must throw.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.amenities', $e->errors());
        }
    }

    public function test_url_email_phone_types_pass_through_as_string(): void
    {
        // The 3 contact-shaped types coerce to string only. The
        // service doesn't validate format — that's the SPA's job (so
        // we can support international phone formats etc. without
        // hard-coding regex). The lock here is: no other coercion
        // fires for these types.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('url')->withKey('website')->create();
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('email')->withKey('billing_email')->create();
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('phone')->withKey('mobile')->create();

        $out = $this->service->validate('inquiry', [
            'website'       => 'https://example.com',
            'billing_email' => 'a@b.test',
            'mobile'        => '+44 7000 000000',
        ]);

        $this->assertSame('https://example.com', $out['website']);
        $this->assertSame('a@b.test', $out['billing_email']);
        $this->assertSame('+44 7000 000000', $out['mobile']);
    }

    public function test_required_field_missing_throws_validation_exception(): void
    {
        // The required gate. ValidationException with the standard
        // shape so callers get 422 + errors[] payload via Laravel's
        // exception handler.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('text')->required()
            ->withKey('booking_ref')->create(['label' => 'Booking reference']);

        try {
            $this->service->validate('inquiry', []);
            $this->fail('Missing required field must throw ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.booking_ref', $e->errors());
            $this->assertStringContainsString(
                'Booking reference is required',
                $e->errors()['custom_data.booking_ref'][0],
            );
        }
    }

    public function test_required_field_with_empty_string_treated_as_missing(): void
    {
        // Empty-ish detection: empty string counts as missing. A user
        // who clears a required field's input must hit the same gate
        // as a user who omits it entirely.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('text')->required()
            ->withKey('vat_id')->create(['label' => 'VAT id']);

        try {
            $this->service->validate('inquiry', ['vat_id' => '']);
            $this->fail('Empty-string required field must throw.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.vat_id', $e->errors());
        }
    }

    public function test_required_multiselect_with_empty_array_treated_as_missing(): void
    {
        // The empty-array case in the empty-ish detector covers
        // multiselects whose user-supplied list is []. Without
        // this branch, required multiselects would silently allow
        // empty submissions.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType(
            'multiselect',
            ['options' => ['gym', 'spa']],
        )->required()->withKey('packages')->create(['label' => 'Packages']);

        try {
            $this->service->validate('inquiry', ['packages' => []]);
            $this->fail('Empty-array required multiselect must throw.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('custom_data.packages', $e->errors());
        }
    }

    public function test_unknown_keys_in_payload_are_silently_dropped(): void
    {
        // The schema gate: only fields defined for this entity make
        // it through. An admin who fat-fingers a key (or an attacker
        // injecting one) gets it silently dropped — no error, no
        // persistence. This is what "schema-on-write" looks like.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('text')->withKey('notes')->create();

        $out = $this->service->validate('inquiry', [
            'notes'         => 'Late check-in',
            'shadow_field'  => 'should disappear',
            'rogue_payload' => ['nested' => 'junk'],
        ]);

        $this->assertSame(['notes' => 'Late check-in'], $out,
            'Unknown keys must be silently dropped.');
    }

    public function test_inactive_fields_are_not_considered_for_validation(): void
    {
        // Soft-deactivated fields are NOT enforced — their values
        // on existing rows persist (admin can re-activate later) but
        // new submissions don't have to satisfy them.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('text')->required()->inactive()
            ->withKey('deprecated_field')->create(['label' => 'Deprecated field']);

        // No throw despite required + missing — inactive fields are
        // excluded from the active-fields query.
        $out = $this->service->validate('inquiry', []);

        $this->assertNull($out);
    }

    public function test_no_schema_for_entity_returns_null_and_drops_payload(): void
    {
        // The "no fields configured" path: nothing to validate, so
        // every supplied value is silently dropped. Mirrors the
        // unknown-key behaviour at the per-key level.
        $out = $this->service->validate('inquiry', ['anything' => 'goes']);

        $this->assertNull($out);
    }

    public function test_empty_clean_returns_null_so_jsonb_column_can_stay_null(): void
    {
        // The {} → NULL conversion at the bottom. Without it,
        // entities would stamp jsonb {} on every save with no
        // custom-data — wasteful storage + non-NULL ambiguity.
        CustomFieldFactory::new()->ofEntity('inquiry')->ofType('text')->withKey('optional')->create();

        $out = $this->service->validate('inquiry', []);

        $this->assertNull($out, 'Empty-clean must return null so custom_data column can be NULL.');
    }
}
