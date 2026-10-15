<?php

namespace Tests\Feature\Content;

use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class ContentAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_owners_and_managers_manage_and_everyone_else_does_not(): void
    {
        $this->assertTrue(ContentAccess::canManage($this->manager));
        $this->assertTrue(ContentAccess::canManage($this->staffUser($this->org, ['role' => 'super_admin'])));
        $this->assertFalse(ContentAccess::canManage($this->staffMember));
        $this->assertFalse(ContentAccess::canManage($this->staffUser($this->org, ['role' => 'manager', 'is_active' => false])));
    }

    public function test_a_refusal_carries_its_code_and_status(): void
    {
        try {
            ContentAccess::requireManager($this->staffMember);
            $this->fail('a staff member was let through');
        } catch (ContentRefused $e) {
            $this->assertSame('manager_only', $e->errorCode);
            $this->assertSame(403, $e->status);
            $this->assertSame(['error' => 'manager_only', 'message' => $e->getMessage()], $e->render()->getData(true));
        }
    }

    public function test_the_context_lists_the_brands_a_person_may_use_and_picks_the_default(): void
    {
        [$second] = $this->secondBrand();
        $this->assertSame([$this->brandId, $second], ContentContext::brandsFor($this->manager)->pluck('id')->all());
        $this->assertSame($this->brandId, ContentContext::fallbackBrandId($this->manager));

        DB::table('brand_user')->insert(['brand_id' => $second, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame([$second], ContentContext::brandsFor($this->staffMember)->pluck('id')->all());
        $this->assertSame($second, ContentContext::fallbackBrandId($this->staffMember));
    }

    public function test_the_profile_is_the_bound_brands_and_its_absence_is_a_refusal(): void
    {
        $this->assertSame($this->profile->id, ContentContext::profile()?->id);

        [$second] = $this->secondBrand(withProfile: false);
        app()->instance('current_brand_id', $second);
        $this->assertNull(ContentContext::profile());
        $this->expectException(ContentRefused::class);
        ContentContext::requireProfile();
    }
}
