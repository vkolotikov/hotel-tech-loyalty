<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * HexaTech CRM's brand switcher (owner 2026-11-09: "select which organisation we are working in and see its data" —
 * the organisation's brands). The bootstrap lists the brands a person may work in, says whether "All brands" is theirs
 * and which brand the request was scoped to; the brand chosen (`?brand_id=`) scopes the CRM's data, as in the full
 * admin. A staff member assigned to one brand sees only it, whatever is asked; another organisation's brand is never
 * offered nor honoured.
 */
class BrandSwitchTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private int $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        DB::table('brands')->where('id', $this->brandId)->update(['name' => 'Harbour Clinic', 'is_default' => true]);
        $this->second = DB::table('brands')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Old Town Studio', 'slug' => 'old-town-studio', 'widget_token' => Str::random(40), 'is_default' => false, 'primary_color' => '#2255aa', 'created_at' => now(), 'updated_at' => now()]);

        // A waiting chat in each brand.
        $this->chat(['status' => 'waiting', 'brand_id' => $this->brandId]);
        $this->chat(['status' => 'waiting', 'brand_id' => $this->second]);
        $this->chat(['status' => 'waiting', 'brand_id' => $this->second]);
    }

    private function boot(string $brand): array
    {
        return $this->asStaffMember()->getJson($this->crmApi("bootstrap?brand_id={$brand}"))->assertOk()->json();
    }

    public function test_the_bootstrap_lists_the_brands_and_all_brands_counts_every_one(): void
    {
        $boot = $this->boot('all');
        $this->assertSame([['Harbour Clinic', true], ['Old Town Studio', false]], array_map(fn ($b) => [$b['name'], $b['is_default']], $boot['brands']));
        $this->assertSame('#2255aa', $boot['brands'][1]['color']);
        $this->assertTrue($boot['all_brands']);
        $this->assertNull($boot['brand_id']);
        $this->assertSame(3, $boot['counts']['chats_waiting']);
    }

    public function test_a_chosen_brand_scopes_the_crms_data(): void
    {
        $boot = $this->boot((string) $this->second);
        $this->assertSame($this->second, $boot['brand_id']);
        $this->assertSame(2, $boot['counts']['chats_waiting']);

        $this->assertSame(1, $this->boot((string) $this->brandId)['counts']['chats_waiting']);
    }

    public function test_a_staff_member_assigned_to_one_brand_sees_only_it(): void
    {
        DB::table('brand_user')->insert(['brand_id' => $this->second, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);

        $boot = $this->boot('all');
        $this->assertSame(['Old Town Studio'], array_column($boot['brands'], 'name'));
        $this->assertFalse($boot['all_brands']);
        $this->assertSame($this->second, $boot['brand_id'], 'held to their brand even when all brands are asked for');
        $this->assertSame(2, $boot['counts']['chats_waiting']);

        // Asking for another brand of the organisation is refused.
        $this->asStaffMember()->getJson($this->crmApi("bootstrap?brand_id={$this->brandId}"))->assertForbidden();
    }

    public function test_another_organisations_brand_is_neither_offered_nor_honoured(): void
    {
        $other = \App\Models\Organization::create(['name' => 'Other Clinic', 'slug' => 'other-' . uniqid('', true), 'industry' => 'medical']);
        $foreign = DB::table('brands')->insertGetId(['organization_id' => $other->id, 'name' => 'Not yours', 'slug' => 'not-yours', 'widget_token' => Str::random(40), 'is_default' => false, 'created_at' => now(), 'updated_at' => now()]);

        $boot = $this->boot((string) $foreign);
        $this->assertNotContains('Not yours', array_column($boot['brands'], 'name'));
        $this->assertNull($boot['brand_id']);
        $this->assertSame(3, $boot['counts']['chats_waiting']);
    }
}
