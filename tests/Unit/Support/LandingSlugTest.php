<?php
namespace Tests\Unit\Support;

use App\Models\Organization;
use App\Support\LandingSlug;
use Tests\TestCase;

class LandingSlugTest extends TestCase
{
    public function test_it_normalises_what_a_person_would_type(): void
    {
        $this->assertSame('glamour-salon', LandingSlug::normalise('  Glamour Salon  '));
        $this->assertSame('cafe-mimi', LandingSlug::normalise('Café Mimi'));
        $this->assertSame('a-b', LandingSlug::normalise('a---b'));
    }

    public function test_it_rejects_shapes_that_break_a_url(): void
    {
        $this->assertFalse(LandingSlug::isValid('ab'));                 // too short
        $this->assertFalse(LandingSlug::isValid(str_repeat('a', 64)));  // too long
        $this->assertFalse(LandingSlug::isValid('-leading'));
        $this->assertFalse(LandingSlug::isValid('trailing-'));
        $this->assertFalse(LandingSlug::isValid('Has Spaces'));
        $this->assertFalse(LandingSlug::isValid('under_score'));
        $this->assertTrue(LandingSlug::isValid('glamour-salon'));
    }

    public function test_it_rejects_smuggled_control_characters(): void
    {
        // PCRE's `$` matches before a trailing newline unless the pattern
        // carries the D modifier, so an otherwise-valid slug with a \n glued
        // to the end used to validate. isValid() runs on values read back
        // from the database, not only on user input, so a bad row could
        // put a raw control character into a redirect's Location header.
        $this->assertFalse(LandingSlug::isValid("glamour-salon\n"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\r"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\r\n"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\0"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\t"));
        $this->assertFalse(LandingSlug::isValid("glamour\nsalon"));
    }

    public function test_it_accepts_the_exact_boundary_lengths(): void
    {
        // The two rejections above prove 2 and 64 chars are invalid, but
        // never that MIN/MAX are actually 3 and 63 - an off-by-one on
        // either constant (e.g. MIN bumped to 4, or MAX dropped to 62)
        // would leave both existing assertions green.
        $this->assertTrue(LandingSlug::isValid(str_repeat('a', 3)));
        $this->assertTrue(LandingSlug::isValid(str_repeat('a', 63)));
    }

    public function test_it_reserves_our_own_words(): void
    {
        // A tenant owning "admin" or "api" on the public host would shadow a
        // route we may need, and "beauty" would read as one of our brands.
        foreach (['api', 'admin', 'login', 'spa', 'assets', 'storage', 'www', 'sites', 'beauty', 'medical'] as $word) {
            $this->assertTrue(LandingSlug::isReserved($word), "{$word} should be reserved");
        }

        $this->assertFalse(LandingSlug::isReserved('glamour-salon'));
    }

    public function test_it_reserves_every_industry_id_in_the_shape_a_slug_actually_takes(): void
    {
        // Organization::INDUSTRIES contains 'real_estate' — a compound id
        // whose slug form is 'real-estate', not the underscored original.
        // Comparing raw ids against a normalised slug lets that one through,
        // so this walks every industry id through the same normalise() a
        // caller would use, covering any future compound id too.
        foreach (Organization::INDUSTRIES as $industry) {
            $slugForm = LandingSlug::normalise($industry);

            $this->assertTrue(
                LandingSlug::isReserved($slugForm),
                "{$slugForm} (slug form of industry '{$industry}') should be reserved"
            );
        }
    }
}
