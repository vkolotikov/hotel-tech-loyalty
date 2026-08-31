<?php
namespace Tests\Unit\Landing;

use App\Landing\IndustryProfile;
use App\Landing\SectionType;
use Illuminate\Support\Facades\View;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The section-type catalogue.
 *
 * Written the way IndustryProfileTest and PaletteTest are written: assertions
 * about authored data and the resolvers over it, with no database and no HTTP.
 * Extends Tests\TestCase rather than plain PHPUnit because two of these ask
 * the view finder whether a partial exists, which needs the framework booted.
 *
 * The point of this class is that four different parts of the builder stopped
 * holding their own answer to "what is a section", so the tests that matter
 * most here are the ones that BIND the catalogue to its consumers — the
 * industry default lists, the shipped partials — rather than the ones that
 * merely restate the table.
 */
class SectionTypeTest extends TestCase
{
    // ─── The catalogue and the things that must agree with it ─────────────

    /**
     * Every key any industry creates a page with is a type this catalogue
     * knows.
     *
     * This is the binding that lets IndustryProfile::$defaultSections stay
     * where it is instead of being copied in here: it answers "which bands
     * does a clinic's page open with", which is an editorial choice per
     * industry, not a fact about the type. The two lists are allowed to be
     * separate exactly as long as one is a subset of the other, and that is
     * what this asserts — a tenth industry seeded with a band nobody
     * authored would otherwise create rows the renderer silently skips
     * forever.
     */
    public function test_every_industry_default_section_is_a_known_type(): void
    {
        foreach (IndustryProfile::all() as $industry => $profile) {
            foreach ($profile['defaultSections'] as $key) {
                $this->assertNotNull(
                    SectionType::typeOf($key),
                    "The {$industry} profile creates a page with a '{$key}' band, which the section catalogue does not know about."
                );
            }
        }
    }

    /** Every type names a partial that has actually shipped. */
    public function test_every_type_resolves_to_a_view_that_exists(): void
    {
        foreach (SectionType::ids() as $id) {
            $type = SectionType::get($id);

            $this->assertNotNull($type);
            $this->assertTrue(
                View::exists('landing.ruled_page.sections.' . $type->view),
                "The '{$id}' type names a partial ({$type->view}) that does not exist."
            );
        }
    }

    /**
     * `image` is a claim about the partial, so it is checked against the
     * partial: a type that says it takes a photo must actually read one, and
     * a type that says it does not must not.
     *
     * PageContent::imageUrl() is the ONE allowlisted read of that leaf (its
     * own docblock says so and the render tests hold it to that), so its
     * presence in the file is a reliable proxy for "this band has a plate" —
     * and this test is what stops a future partial gaining or losing a plate
     * without the catalogue, the image endpoints' slot rule and update()'s
     * carry-forward hearing about it.
     */
    public function test_the_image_flag_matches_what_each_partial_actually_reads(): void
    {
        foreach (SectionType::ids() as $id) {
            $type = SectionType::get($id);
            $file = resource_path('views/landing/ruled_page/sections/' . $type->view . '.blade.php');

            $this->assertFileExists($file);

            $readsAnImage = str_contains(file_get_contents($file), 'imageUrl(');

            $this->assertSame(
                $type->image,
                $readsAnImage,
                "The '{$id}' type declares image=" . var_export($type->image, true)
                . ' but its partial ' . ($readsAnImage ? 'does' : 'does not') . ' read a photo plate.'
            );
        }
    }

    /**
     * `fields` is descriptive rather than enforced (content is validated for
     * SHAPE, not membership), which is exactly why it needs a test: an
     * editor built from this list would silently stop offering a field the
     * partial still renders.
     *
     * Asserted one way only — every `$copy[...]` read a partial performs must
     * be listed — and not the other. contact's phone/email/address are read
     * through ContactDetails rather than through `$copy`, and hero's kicker
     * is read in the layout as well as the partial, so "listed but not
     * greppable as $copy" is a legitimate state and "read but not listed" is
     * not.
     */
    public function test_every_copy_field_a_partial_reads_is_listed_on_its_type(): void
    {
        foreach (SectionType::ids() as $id) {
            $type = SectionType::get($id);
            $body = file_get_contents(
                resource_path('views/landing/ruled_page/sections/' . $type->view . '.blade.php')
            );

            preg_match_all("/\\\$copy\['([a-z_]+)'\]/", $body, $matches);

            foreach (array_unique($matches[1]) as $field) {
                $this->assertContains(
                    $field,
                    $type->fields,
                    "The '{$id}' partial reads \$copy['{$field}'], which its type does not list as an editable field."
                );
            }
        }
    }

    /** image_url has one writer and it is not the copy form — it must never be offered as a field. */
    public function test_no_type_offers_image_url_as_an_editable_field(): void
    {
        foreach (SectionType::ids() as $id) {
            $this->assertNotContains('image_url', SectionType::get($id)->fields,
                "The '{$id}' type offers image_url as editable copy, which update() refuses to write.");
        }
    }

    // ─── The key grammar (the one parser) ─────────────────────────────────

    public function test_a_fixed_type_is_named_by_its_own_key(): void
    {
        $this->assertSame('about', SectionType::typeOf('about'));
        $this->assertSame('hero', SectionType::typeOf('hero'));
        $this->assertSame('landing.ruled_page.sections.about', SectionType::viewFor('about'));
    }

    /**
     * A repeatable type has NO bare key. `text` alone must not resolve, or a
     * row could exist that the instance cap cannot count and the editor
     * cannot enumerate — a seventh text band by another name.
     */
    public function test_a_repeatable_type_has_no_bare_key(): void
    {
        $this->assertNull(SectionType::typeOf('text'));
        $this->assertNull(SectionType::viewFor('text'));
        $this->assertFalse(SectionType::isInstanceKey('text'));
    }

    public function test_instance_keys_resolve_to_their_type_and_share_one_partial(): void
    {
        foreach (['text_1', 'text_2', 'text_6'] as $key) {
            $this->assertSame('text', SectionType::typeOf($key));
            $this->assertTrue(SectionType::isInstanceKey($key));
            $this->assertSame('landing.ruled_page.sections.text', SectionType::viewFor($key),
                "Instance keys must all render through ONE partial; {$key} does not.");
        }
    }

    /**
     * The grammar is bounded and exact. Each of these is a real shape a
     * client or a raw write can produce, and each has to be a non-section:
     *
     *   - text_7  — past the cap. The cap bounds the GRAMMAR, not just the
     *               create endpoint, which is what stops the image slot
     *               allowlist being an infinite family of keys.
     *   - text_0  — indices start at one; text_0 would be a seventh slot.
     *   - text_01 — a leading zero is a second spelling of text_1, and two
     *               spellings of one key is how a cap gets counted wrong.
     *   - text_1_2, TEXT_1, text_, text_-1, text_1.0 — not the grammar.
     *   - services_1 — a real type, but not a repeatable one.
     */
    public static function nonSectionKeys(): array
    {
        return [
            'past the cap'      => ['text_7'],
            'far past the cap'  => ['text_9999'],
            'zero index'        => ['text_0'],
            'leading zero'      => ['text_01'],
            'double index'      => ['text_1_2'],
            'upper case'        => ['TEXT_1'],
            'no index'          => ['text_'],
            'negative index'    => ['text_-1'],
            'decimal index'     => ['text_1.0'],
            'not repeatable'    => ['services_1'],
            'unknown type'      => ['gallery_1'],
            'empty'             => [''],
            'junk'              => ['../../etc/passwd'],
        ];
    }

    #[DataProvider('nonSectionKeys')]
    public function test_a_key_outside_the_grammar_is_not_a_section(string $key): void
    {
        $this->assertNull(SectionType::typeOf($key), "'{$key}' resolved to a section type.");
        $this->assertNull(SectionType::viewFor($key), "'{$key}' resolved to a view.");
        $this->assertNull(SectionType::forKey($key));
        $this->assertFalse(SectionType::isInstanceKey($key));
    }

    // ─── Instance allocation ──────────────────────────────────────────────

    public function test_the_next_instance_key_is_the_lowest_free_index(): void
    {
        $this->assertSame('text_1', SectionType::nextInstanceKey('text', []));
        $this->assertSame('text_2', SectionType::nextInstanceKey('text', ['hero', 'text_1', 'contact']));

        // Lowest FREE, not highest plus one. This is the whole reason the
        // allocator exists: with "highest plus one" a tenant who has added
        // and removed six bands could never add a seventh despite having
        // none, because the namespace rather than the page would be full.
        $this->assertSame('text_2', SectionType::nextInstanceKey('text', ['text_1', 'text_3', 'text_6']));
    }

    public function test_the_allocator_reports_the_cap_as_null(): void
    {
        $full = [];

        for ($n = 1; $n <= SectionType::MAX_INSTANCES_PER_TYPE; $n++) {
            $full[] = 'text_' . $n;
        }

        $this->assertNull(SectionType::nextInstanceKey('text', $full),
            'The allocator handed out a key past the instance cap.');
    }

    /** Only repeatable types have instances, so nothing else may be allocated one. */
    public function test_a_fixed_type_can_never_be_allocated_an_instance(): void
    {
        $this->assertNull(SectionType::nextInstanceKey('about', []));
        $this->assertNull(SectionType::nextInstanceKey('hero', []));
        $this->assertNull(SectionType::nextInstanceKey('not_a_type', []));
    }

    public function test_only_repeatable_types_may_be_added(): void
    {
        $this->assertSame(['text'], SectionType::repeatableIds());
    }

    // ─── The image slot allowlist ─────────────────────────────────────────

    /**
     * The image endpoints' whole `slot` rule, and the thing that replaced
     * their `in:hero,about` literal. Asserted as a SET EQUALITY, not as a
     * couple of memberships: the failure this guards is a slot quietly
     * appearing (an upload target the renderer never reads) as much as one
     * quietly vanishing.
     */
    public function test_the_image_slots_are_exactly_the_keys_whose_type_carries_a_photo(): void
    {
        $expected = [];

        foreach (SectionType::all() as $id => $type) {
            if (!$type['image']) {
                continue;
            }

            if ($type['repeatable']) {
                for ($n = 1; $n <= SectionType::MAX_INSTANCES_PER_TYPE; $n++) {
                    $expected[] = $id . '_' . $n;
                }

                continue;
            }

            $expected[] = $id;
        }

        $this->assertSame($expected, SectionType::imageKeys());

        // Every slot it publishes is a key the grammar accepts — an
        // allowlisted upload target the renderer could never read would be
        // an orphan file by construction.
        foreach (SectionType::imageKeys() as $slot) {
            $this->assertNotNull(SectionType::typeOf($slot), "The image slot '{$slot}' is not a section key.");
            $this->assertTrue(SectionType::forKey($slot)->image);
        }
    }

    // ─── The editor payload ───────────────────────────────────────────────

    /**
     * The shape the editor task will consume. Pinned because it is a
     * published contract, and because `view` must stay OUT of it: it is a
     * server-side file path the browser can do nothing with.
     */
    public function test_the_payload_publishes_one_row_per_type_with_no_server_paths(): void
    {
        $payload = SectionType::payload();

        $this->assertSame(SectionType::ids(), array_column($payload, 'id'),
            'The payload must carry every type, in authored order.');

        foreach ($payload as $row) {
            $this->assertSame(
                ['id', 'repeatable', 'fields', 'image', 'limit'],
                array_keys($row),
                "The '{$row['id']}' row does not carry exactly the published keys."
            );

            $this->assertSame(
                $row['repeatable'] ? SectionType::MAX_INSTANCES_PER_TYPE : null,
                $row['limit'],
                "The '{$row['id']}' row publishes the wrong limit."
            );
        }
    }
}
