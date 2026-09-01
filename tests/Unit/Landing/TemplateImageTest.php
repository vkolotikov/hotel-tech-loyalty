<?php
namespace Tests\Unit\Landing;

use App\Landing\SectionType;
use App\Landing\TemplateImage;
use Tests\TestCase;

/**
 * The design's own photographs — the default half of template fidelity
 * Phase 4's default+override image model.
 *
 * Written the way SectionTypeTest is written: assertions about authored data
 * and the resolvers over it, with no database and no HTTP. Extends
 * Tests\TestCase rather than plain PHPUnit because `asset()` needs the
 * framework booted.
 *
 * What matters here is not the table's contents but its BINDINGS — that
 * every slot it names is a slot the image endpoints accept, that every file
 * it names is actually deployed, and that a design which ships no
 * photographs of its own is answered with null rather than with somebody
 * else's.
 */
class TemplateImageTest extends TestCase
{
    /**
     * THE BINDING THAT MATTERS MOST: a default and the upload that replaces
     * it name the same thing.
     *
     * A slot outside `SectionType::imageKeys()` would be a photograph the
     * page renders and no endpoint can ever replace — the exact inverse of
     * the bug 4.5 is about, and a worse one, because the tenant can see it.
     */
    public function test_every_default_names_a_slot_the_endpoints_accept(): void
    {
        $allowed = SectionType::imageKeys();
        $checked = 0;

        foreach (SectionType::TEMPLATES_WITH_PARTIALS as $template) {
            foreach (array_keys(TemplateImage::map($template)) as $slot) {
                $checked++;

                $this->assertContains($slot, $allowed,
                    "The '{$template}' design ships a photograph for '{$slot}', which no endpoint can replace.");

                $this->assertNotNull(SectionType::imageSlot($slot),
                    "The '{$template}' design ships a photograph for '{$slot}', which the slot parser refuses.");
            }
        }

        $this->assertGreaterThan(0, $checked, 'No design ships a photograph at all; this test proved nothing.');
    }

    /**
     * Every file named is on disk, under the tree
     * NocturneRitualRenderTest already pins byte-for-byte against the kit's
     * own `assets/` directory. A missing one is a broken <img> on every page
     * of that design at once.
     */
    public function test_every_default_photograph_is_actually_deployed(): void
    {
        foreach (SectionType::TEMPLATES_WITH_PARTIALS as $template) {
            foreach (TemplateImage::map($template) as $slot => $url) {
                $path = public_path(parse_url($url, PHP_URL_PATH));

                $this->assertFileExists($path,
                    "The '{$template}' design's photograph for '{$slot}' is not deployed.");

                $this->assertStringContainsString(
                    '/landing/' . $template . '/assets/',
                    (string) parse_url($url, PHP_URL_PATH),
                    "The '{$template}' design's photograph for '{$slot}' is served from another design's tree.",
                );
            }
        }
    }

    /** Every photograph is described, or it ships with an empty alt on every page. */
    public function test_every_default_photograph_carries_a_description(): void
    {
        foreach (SectionType::TEMPLATES_WITH_PARTIALS as $template) {
            foreach (array_keys(TemplateImage::map($template)) as $slot) {
                $alt = TemplateImage::alt($template, $slot);

                $this->assertIsString($alt);
                $this->assertNotSame('', trim((string) $alt),
                    "The '{$template}' design's photograph for '{$slot}' has no description.");
            }
        }
    }

    /**
     * THE DESCRIPTIONS DESCRIBE THE PICTURE, NEVER THE AUTHOR'S BUSINESS.
     *
     * The kit writes "…at Nocturne Bathhouse" and "Nocturne practitioners
     * Amara, Mei and Clara" — its own fictional studio and its own fictional
     * staff. Correct on the author's demo page; a fabrication on a real
     * salon's, published in the one place nobody proofreads.
     */
    public function test_no_description_names_the_kits_fictional_business(): void
    {
        foreach (SectionType::TEMPLATES_WITH_PARTIALS as $template) {
            foreach (array_keys(TemplateImage::map($template)) as $slot) {
                $alt = (string) TemplateImage::alt($template, $slot);

                foreach (['Nocturne', 'Amara', 'Mei', 'Clara', 'Bathhouse'] as $name) {
                    $this->assertStringNotContainsStringIgnoringCase($name, $alt,
                        "The '{$template}' description for '{$slot}' names the kit's own fictional business.");
                }
            }
        }
    }

    /**
     * The kit's fourteen-photograph mosaic is drawn once, on the FIRST
     * gallery band. A second gallery is the tenant's own idea and defaulting
     * it to the same pictures would publish them twice on one page.
     */
    public function test_only_the_first_gallery_carries_the_designs_mosaic(): void
    {
        $slots = array_keys(TemplateImage::map('nocturne_ritual'));

        $this->assertContains('gallery_1.image_1', $slots);
        $this->assertContains('gallery_1.image_4', $slots);

        foreach ($slots as $slot) {
            $this->assertStringStartsNotWith('gallery_2', $slot);
            $this->assertStringStartsNotWith('gallery_3', $slot);
        }
    }

    /**
     * R2: the author reuses the hero plate on the closing panel, so that
     * reuse survives as the DEFAULT rather than as a hard-coded alias. Two
     * slots, one file, and either one replaceable on its own.
     */
    public function test_the_closing_panel_defaults_to_the_heros_own_plate(): void
    {
        $map = TemplateImage::map('nocturne_ritual');

        $this->assertArrayHasKey('booking', $map);
        $this->assertSame($map['hero'], $map['booking']);

        // Described separately, because they are two placements of one
        // photograph and the words under each are the author's own.
        $this->assertNotSame(
            TemplateImage::alt('nocturne_ritual', 'hero'),
            TemplateImage::alt('nocturne_ritual', 'booking'),
        );
    }

    /**
     * A design that ships no photographs answers null for everything — which
     * is exactly what every page rendered before this class existed did, and
     * is why The Ruled Page's four byte goldens did not move.
     */
    public function test_a_design_with_no_photographs_answers_nothing(): void
    {
        $this->assertSame([], TemplateImage::map('ruled_page'));
        $this->assertNull(TemplateImage::url('ruled_page', 'hero'));
        $this->assertNull(TemplateImage::alt('ruled_page', 'hero'));
    }

    /**
     * `template_key` is a plain varchar off the page row with no constraint
     * behind it. A value that reached it by any route other than the
     * endpoints must resolve to nothing rather than to a path.
     */
    public function test_an_unknown_or_hostile_template_key_resolves_to_nothing(): void
    {
        foreach ([null, '', 'nope', '../../etc/passwd', 'nocturne_ritual/../..'] as $key) {
            $this->assertSame([], TemplateImage::map($key));
            $this->assertNull(TemplateImage::url($key, 'hero'));
            $this->assertNull(TemplateImage::alt($key, 'hero'));
        }
    }

    /** A slot the design has no photograph for is null, not a guess. */
    public function test_an_unknown_slot_resolves_to_nothing(): void
    {
        foreach (['services', 'text_1', 'gallery_1.image_8', 'reviews', 'nope'] as $slot) {
            $this->assertNull(TemplateImage::url('nocturne_ritual', $slot),
                "'{$slot}' resolved to a photograph the design does not have.");
        }
    }
}
