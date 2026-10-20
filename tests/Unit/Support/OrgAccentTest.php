<?php

namespace Tests\Unit\Support;

use App\Support\OrgAccent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The organisation's accent setting (5B-1 review: it belongs in App\Support, not in a controller). */
class OrgAccentTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_primary_colour_setting_as_a_lowercase_hex_or_nothing(): void
    {
        $this->assertNull(OrgAccent::of($this->org->id));
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'primary_color', 'value' => ' #A1B2C3 ']);
        $this->assertSame('#a1b2c3', OrgAccent::of($this->org->id));
        DB::table('hotel_settings')->where('key', 'primary_color')->update(['value' => 'red']);
        $this->assertNull(OrgAccent::of($this->org->id));
    }
}
