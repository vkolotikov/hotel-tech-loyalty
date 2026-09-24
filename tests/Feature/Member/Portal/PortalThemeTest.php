<?php

namespace Tests\Feature\Member\Portal;

use App\Models\Organization;
use App\Services\Portal\PortalTheme;
use App\Support\Accent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class PortalThemeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // organizations + hotel_settings
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', fn ($t) => $t->string('industry', 32)->nullable());
        }
    }

    private function org(string $industry = 'beauty'): Organization
    {
        $org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        DB::table('organizations')->where('id', $org->id)->update(['industry' => $industry]);
        return $org->fresh();
    }

    private function colour(Organization $org, string $hex): void
    {
        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => 'primary_color', 'value' => $hex,
            'type' => 'string', 'group' => 'appearance', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_theme_falls_back_to_the_industry_default_when_no_colour_is_set(): void
    {
        $theme = PortalTheme::for($this->org('beauty'));

        $this->assertSame(PortalTheme::ACCENT_DEFAULTS['beauty'], strtoupper($theme['accent']['hex']));
        $this->assertSame('cormorant', $theme['display_face']);
        $this->assertSame('beauty', $theme['industry']);
    }

    public function test_a_readable_tenant_colour_is_kept_and_both_modes_get_readable_ink(): void
    {
        $org = $this->org('hotel');
        $this->colour($org, '#1F7A73');

        $a = PortalTheme::for($org)['accent'];

        $this->assertSame('#1f7a73', $a['hex']);
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($a['ink'], $a['hex']));
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($a['dark_ink'], $a['dark_hex']));
        // The text shade must read on its own surface in each mode.
        $this->assertGreaterThanOrEqual(4.5, Accent::contrast($a['deep'], PortalTheme::LIGHT_SURFACE));
        $this->assertGreaterThanOrEqual(4.5, Accent::contrast($a['dark_deep'], PortalTheme::DARK_SURFACE));
    }

    public function test_an_unreadable_tenant_colour_is_replaced(): void
    {
        $org = $this->org('hotel');
        $this->colour($org, '#0078D7'); // the dead-band hex Accent documents

        $a = PortalTheme::for($org)['accent'];

        $this->assertNotSame('#0078d7', $a['hex']);
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($a['ink'], $a['hex']));
    }

    public function test_unknown_industries_get_the_generic_face_and_accent(): void
    {
        $theme = PortalTheme::for($this->org('legal'));

        $this->assertSame('manrope', $theme['display_face']);
        $this->assertSame(PortalTheme::ACCENT_FALLBACK, strtoupper($theme['accent']['hex']));
    }
}
