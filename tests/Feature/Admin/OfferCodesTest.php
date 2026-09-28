<?php

namespace Tests\Feature\Admin;

use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\SpecialOffer;
use App\Models\User;
use Tests\Concerns\MakesAdminCaller;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Task 12: offers gain a member-facing code (trimmed, upper-cased, unique
 * per organisation), a booking-scope (`applies_to`), tier targeting and a
 * `fixed_amount` type. `update()` used to accept every one of these fields
 * through an unvalidated `$request->only()` — this locks that down to real
 * validation rules without breaking the multipart image upload it also
 * carries.
 */
class OfferCodesTest extends MemberEndpointTestCase
{
    use MakesAdminCaller, SeedsDiscountFixture;

    private Organization $org;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        $this->org = $this->tenant();
        $this->admin = $this->staffUser($this->org, ['can_manage_offers' => true]);
    }

    private function offer(array $body = [])
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/offers', array_merge(['title' => 'Welcome', 'description' => 'Ten off', 'type' => 'discount', 'value' => 10, 'start_date' => now()->toDateString(), 'end_date' => now()->addDays(10)->toDateString()], $body));
    }

    public function test_a_code_is_stored_upper_cased_and_unique_per_venue(): void
    {
        $this->offer(['code' => ' welcome10 '])->assertStatus(201);
        $this->assertSame('WELCOME10', SpecialOffer::withoutGlobalScopes()->where('organization_id', $this->org->id)->value('code'));
        $this->offer(['code' => 'welcome10', 'title' => 'Again'])->assertStatus(422);

        $other = $this->tenant('Other');
        $otherAdmin = $this->staffUser($other, ['can_manage_offers' => true]);
        $this->actingAs($otherAdmin, 'sanctum')->postJson('/api/v1/admin/offers', ['title' => 'Welcome', 'description' => 'x', 'type' => 'discount', 'value' => 10, 'code' => 'WELCOME10', 'start_date' => now()->toDateString(), 'end_date' => now()->addDays(10)->toDateString()])->assertStatus(201);
    }

    public function test_fixed_amount_tier_targeting_and_scope_are_accepted(): void
    {
        $tier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->firstOrFail();
        $id = $this->offer(['type' => 'fixed_amount', 'value' => 5, 'tier_ids' => [$tier->id], 'per_member_limit' => 1, 'applies_to' => 'services'])->assertStatus(201)->json('offer.id');
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['applies_to' => 'stays'])->assertOk();
        $this->assertSame('stays', SpecialOffer::withoutGlobalScopes()->find($id)->applies_to);
    }

    /**
     * Task 19 fix round: the admin form always sends `tier_ids` — as
     * `tier_ids[]` entries when tiers are selected, or a bare `tier_ids`
     * field holding `''` when the selection is emptied. Nothing exercised
     * either path end to end. `putJson()`'s JSON body goes through the same
     * global `ConvertEmptyStringsToNull` middleware as a multipart request
     * (`TransformsRequest::clean()` cleans `$request->json()` too when
     * `$request->isJson()`), so asserting against a JSON `''` here proves
     * the same server-side behaviour the multipart form relies on.
     */
    public function test_tier_targeting_survives_an_untouched_save_and_is_cleared_by_an_empty_one(): void
    {
        $tier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->firstOrFail();
        $id = $this->offer(['tier_ids' => [$tier->id]])->assertStatus(201)->json('offer.id');
        $this->assertSame([$tier->id], SpecialOffer::withoutGlobalScopes()->find($id)->tier_ids);

        // An update that only touches another field must leave tier_ids untouched.
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['title' => 'Renamed'])->assertOk();
        $this->assertSame([$tier->id], SpecialOffer::withoutGlobalScopes()->find($id)->tier_ids);

        // The emptied-selection shape the form sends: `tier_ids` present as
        // a bare '' field, no `tier_ids[]` entries.
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['tier_ids' => ''])->assertOk();
        $offer = SpecialOffer::withoutGlobalScopes()->find($id);
        $this->assertNull($offer->tier_ids);
        // scopeForTier() must now admit a member of ANY tier — this is what
        // "no tier targeting" actually means to the query that reads it.
        $this->assertTrue(SpecialOffer::withoutGlobalScopes()->whereKey($id)->forTier(99999)->exists());

        // Re-setting the targeting via tier_ids[] still works after a clear.
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['tier_ids' => [$tier->id]])->assertOk();
        $this->assertSame([$tier->id], SpecialOffer::withoutGlobalScopes()->find($id)->tier_ids);
    }

    /**
     * Task 21 (eyes first): the admin form posts multipart `FormData`, so every
     * `tier_ids[]` entry arrives as a STRING. Stored as `["30"]`, the member
     * side's `forTier(30)` (`whereJsonContains` with an int) never matched, and
     * a tier-targeted offer was invisible to the very members it targeted.
     */
    public function test_tier_ids_from_the_multipart_form_are_stored_as_integers_and_reach_the_member(): void
    {
        $tier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->firstOrFail();
        $form = ['title' => 'Welcome', 'description' => 'Ten off', 'type' => 'discount', 'value' => '10', 'start_date' => now()->toDateString(), 'end_date' => now()->addDays(10)->toDateString(), 'tier_ids' => [(string) $tier->id]];

        $id = $this->actingAs($this->admin, 'sanctum')->post('/api/v1/admin/offers', $form, ['Accept' => 'application/json'])->assertStatus(201)->json('offer.id');
        $this->assertSame([$tier->id], SpecialOffer::withoutGlobalScopes()->find($id)->tier_ids);
        $this->assertTrue(SpecialOffer::withoutGlobalScopes()->whereKey($id)->forTier($tier->id)->exists());

        $this->actingAs($this->admin, 'sanctum')->post("/api/v1/admin/offers/{$id}", ['_method' => 'PUT', 'tier_ids' => [(string) $tier->id]], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame([$tier->id], SpecialOffer::withoutGlobalScopes()->find($id)->tier_ids);
        $this->assertTrue(SpecialOffer::withoutGlobalScopes()->whereKey($id)->forTier($tier->id)->exists());
    }

    /**
     * Final review, escalated Minor 7: offers written before this branch (or
     * by the AI generator) can carry a type outside the admin list; editing
     * one must keep working, and must keep the type it has.
     */
    public function test_an_offer_with_a_legacy_type_can_still_be_edited(): void
    {
        $id = $this->offer()->assertStatus(201)->json('offer.id');
        SpecialOffer::withoutGlobalScopes()->whereKey($id)->update(['type' => 'vip_experience']);

        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['title' => 'Renamed', 'type' => 'vip_experience'])->assertOk();
        $offer = SpecialOffer::withoutGlobalScopes()->find($id);
        $this->assertSame('Renamed', $offer->title);
        $this->assertSame('vip_experience', $offer->type);

        // Only the offer's own current type is let through, not any string.
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['type' => 'something_else'])->assertStatus(422);
    }

    /** Sending only `end_date` compares it with the stored start date. */
    public function test_an_end_date_alone_is_checked_against_the_stored_start(): void
    {
        $id = $this->offer(['start_date' => now()->addDays(5)->toDateString(), 'end_date' => now()->addDays(10)->toDateString()])->assertStatus(201)->json('offer.id');

        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['end_date' => now()->addDays(20)->toDateString()])->assertOk();
        $this->assertSame(now()->addDays(20)->toDateString(), SpecialOffer::withoutGlobalScopes()->find($id)->end_date->toDateString());

        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['end_date' => now()->addDays(2)->toDateString()])->assertStatus(422)->assertJsonValidationErrors('end_date');
    }
}
