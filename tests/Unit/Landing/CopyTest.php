<?php
namespace Tests\Unit\Landing;

use App\Landing\Copy;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * App\Landing\Copy — the two typographic gestures a kit heading makes, and
 * the only permitted route to either (template fidelity 5.1 / R6 / R7).
 *
 * TWO JOBS IN THIS FILE, and the second one is the more important:
 *
 *  1. the helper behaves — escaping first and always, one break, the `<em>`
 *     omitted when there is nothing to put in it.
 *  2. THE RULING IT IMPLEMENTS IS TRUE OF THE AUTHOR'S OWN FILES. R6 settles
 *     the two-tone heading on a trailing `_accent` leaf, and it says so on
 *     the strength of a survey TRANSCRIPTION rather than a read — the plan's
 *     own "what I do not know" names that gap and tells the implementer to
 *     close it before building on it. The tests at the foot of this file
 *     close it by reading all six `index.html` files and asserting the
 *     property directly, so the day a seventh kit lands with an infix `<em>`
 *     in a heading this goes red instead of shipping a heading that reads
 *     wrong.
 */
class CopyTest extends TestCase
{
    // ─── lines(): the author's hand-placed break, R7 ─────────────────────

    public function test_a_single_line_is_the_escaped_string_and_nothing_else(): void
    {
        $this->assertSame('Let the day fall away.', Copy::lines('Let the day fall away.')->toHtml());
    }

    public function test_the_tenants_newline_becomes_the_authors_break(): void
    {
        $this->assertSame('Let the day<br>fall away.', Copy::lines("Let the day\nfall away.")->toHtml());
    }

    #[DataProvider('lineEndings')]
    public function test_every_line_ending_breaks_exactly_once(string $ending): void
    {
        // A page edited on Windows must behave like one edited anywhere
        // else. \R covers all three and a CRLF is ONE break, not two.
        $this->assertSame('A<br>B', Copy::lines('A' . $ending . 'B')->toHtml());
    }

    public static function lineEndings(): array
    {
        return ['unix' => ["\n"], 'windows' => ["\r\n"], 'classic mac' => ["\r"]];
    }

    public function test_a_run_of_blank_lines_is_one_break(): void
    {
        $this->assertSame('A<br>B', Copy::lines("A\n\n\n   \n B ")->toHtml());
    }

    public function test_the_break_budget_is_one_and_the_rest_rejoins_rather_than_vanishing(): void
    {
        // Three lines pasted into a heading the author sized for two: the
        // words are all still there (losing a tenant's copy silently is the
        // worse failure) and the composition is not four lines tall.
        $this->assertSame('A<br>B C', Copy::lines("A\nB\nC")->toHtml());
    }

    public function test_nothing_at_all_is_an_empty_string_not_a_stray_break(): void
    {
        $this->assertSame('', Copy::lines(null)->toHtml());
        $this->assertSame('', Copy::lines('')->toHtml());
        $this->assertSame('', Copy::lines("\n\n")->toHtml());
    }

    /**
     * THE WHOLE REASON THIS CLASS EXISTS RATHER THAN A RAW ECHO. Every
     * fragment goes through e() before anything is joined, so markup a
     * tenant types is inert and the only tags in the output are the ones
     * this file puts there.
     */
    public function test_a_hostile_heading_is_escaped_on_both_sides_of_the_break(): void
    {
        $html = Copy::lines("<script>alert(1)</script>\n<img src=x onerror=alert(2)>")->toHtml();

        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('<img', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);
        $this->assertStringContainsString('&lt;img src=x onerror=alert(2)&gt;', $html);
        $this->assertSame(1, substr_count($html, '<br>'));
    }

    public function test_quotes_and_ampersands_are_escaped_the_way_blade_escapes_them(): void
    {
        // Blade's own {{ }} is e($v) with ENT_QUOTES — a heading printed
        // through this helper must not be MORE printable than one printed
        // the ordinary way.
        $this->assertSame(e('Morrow & Moss "the" \'one\''), Copy::lines('Morrow & Moss "the" \'one\'')->toHtml());
    }

    // ─── heading(): the two-tone companion, R6 ───────────────────────────

    public function test_no_accent_means_no_em_at_all(): void
    {
        $this->assertSame('Care that follows your natural rhythm.',
            Copy::heading('Care that follows your natural rhythm.')->toHtml());
        $this->assertSame('A heading', Copy::heading('A heading', '   ')->toHtml());
    }

    public function test_the_accent_is_an_em_after_a_single_space(): void
    {
        $this->assertSame(
            'Care that follows your <em>natural rhythm.</em>',
            Copy::heading('Care that follows your', 'natural rhythm.')->toHtml(),
        );
    }

    public function test_the_accent_is_escaped_too(): void
    {
        $html = Copy::heading('Head', '<b>x</b>')->toHtml();

        $this->assertSame('Head <em>&lt;b&gt;x&lt;/b&gt;</em>', $html);
    }

    /**
     * The shape R6's trailing rule alone does not reproduce, and three of
     * the six kits need it: `Come hungry.<br><em>Leave slowly.</em>`. The
     * tenant asks for it with the gesture they already know — a line break
     * at the end of the heading.
     */
    public function test_a_trailing_break_puts_the_emphasis_on_its_own_line(): void
    {
        $this->assertSame(
            'Come hungry.<br><em>Leave slowly.</em>',
            Copy::heading("Come hungry.\n", 'Leave slowly.')->toHtml(),
        );
    }

    public function test_the_accents_own_line_costs_the_same_budget_as_any_other(): void
    {
        // Two lines is two lines however it is spelled: a heading that
        // already breaks cannot ALSO put the accent on a third line.
        $this->assertSame(
            'A B<br><em>C</em>',
            Copy::heading("A\nB\n", 'C')->toHtml(),
        );
    }

    public function test_a_trailing_break_with_no_accent_is_just_whitespace(): void
    {
        $this->assertSame('Come hungry.', Copy::heading("Come hungry.\n")->toHtml());
    }

    public function test_an_accent_with_no_heading_is_the_em_alone(): void
    {
        // A tenant who cleared the heading and left the accent gets the
        // words they still have, not a leading space.
        $this->assertSame('<em>Garden</em>', Copy::heading('', 'Garden')->toHtml());
        $this->assertSame('<em>Garden</em>', Copy::heading(null, 'Garden')->toHtml());
    }

    // ─── plain(): the same words where markup cannot go ──────────────────

    public function test_plain_flattens_every_line_and_appends_the_accent(): void
    {
        $this->assertSame('A table in the light.', Copy::plain("A table\nin the", 'light.'));
    }

    public function test_plain_returns_a_bare_string_that_blade_will_escape(): void
    {
        $value = Copy::plain('<b>x</b>');

        $this->assertIsString($value);
        $this->assertSame('<b>x</b>', $value, 'plain() must not pre-escape — its caller is an ordinary {{ }}.');
    }

    // ─── R6: the ruling, checked against the author's own six files ──────

    /**
     * THE CAVEAT R6 CARRIES, DISCHARGED.
     *
     * Every `<em>` inside a heading element, in every kit, has the closing
     * `</em>` as the last thing before the heading closes. That is exactly
     * what `{{ $heading }} <em>{{ $accent }}</em>` reproduces, and it is
     * what makes a companion leaf sufficient rather than an approximation.
     *
     * Counted as well as asserted, so a kit that stops using `<em>` at all
     * cannot make this pass vacuously.
     */
    #[DataProvider('kits')]
    public function test_every_emphasised_heading_emphasises_its_trailing_fragment(string $kit, int $expected): void
    {
        $headings = $this->headingsWithEmphasis($kit);

        $this->assertCount($expected, $headings,
            "The number of emphasised headings in {$kit} has changed; re-read the kit before trusting R6.");

        foreach ($headings as $heading) {
            $this->assertMatchesRegularExpression(
                '#<em>.*</em>\s*$#us',
                $heading,
                "A heading in {$kit} emphasises a fragment that is NOT trailing: {$heading}",
            );
        }
    }

    /**
     * @return array<string, array{0: string, 1: int}>
     */
    public static function kits(): array
    {
        return [
            'beauty 01 nocturne ritual'   => ['beauty-tech/01-nocturne-ritual', 0],
            'beauty 02 editorial atelier' => ['beauty-tech/02-editorial-atelier', 2],
            'beauty 03 organic wellness'  => ['beauty-tech/03-organic-wellness', 8],
            'hospitality 01 maison vela'  => ['hospitality/01-maison-vela', 1],
            'hospitality 02 luma garden'  => ['hospitality/02-luma-garden', 1],
            'hospitality 03 ember table'  => ['hospitality/03-ember-table', 1],
        ];
    }

    /**
     * THE OTHER HALF OF THE SURVEY, written down because it is the half that
     * would have been a surprise.
     *
     * Four `<em>`s in these files are NOT in a heading and two of them are
     * genuinely infix — kit 03's `Morrow <em>&amp;</em> Moss` and kit 02's
     * `Luma <em>Garden</em>` are BRAND WORDMARKS, in the header and footer
     * lockups. They are derived from the business's own name (see
     * layout.blade.php's `$brandName` chain) and are not heading leaves at
     * all, so R6's mechanism neither covers them nor needs to. Phase 7 and
     * phase 8 will have to answer them separately, and this test is here so
     * that whoever reads R6 next knows the exception exists.
     */
    public function test_the_only_non_trailing_emphasis_in_any_kit_is_inside_a_brand_wordmark(): void
    {
        $offenders = [];

        foreach (array_column(self::kits(), 0) as $kit) {
            $html = $this->kitHtml($kit);

            // Every <em> in the file, with the element it sits inside.
            preg_match_all('#<(h1|h2|h3|span|strong)\b[^>]*>(?:(?!</\1>).)*<em>.*?</em>(?:(?!</\1>).)*</\1>#us',
                $html, $matches);

            foreach ($matches[0] as $i => $fragment) {
                if (preg_match('#<em>.*</em>\s*</#us', $fragment) === 1) {
                    continue;
                }

                $offenders[] = [$kit, $matches[1][$i]];
            }
        }

        // Both offenders are `<span class="brand__name">` wordmarks in kit
        // 03 (its header and its footer). Nothing else in six files.
        $this->assertSame(
            [
                ['beauty-tech/03-organic-wellness', 'span'],
                ['beauty-tech/03-organic-wellness', 'span'],
            ],
            $offenders,
            'A non-trailing <em> appeared outside a brand wordmark — R6 needs re-deciding.',
        );
    }

    /** Every h1/h2 in a kit that contains an <em>, inner HTML only. */
    private function headingsWithEmphasis(string $kit): array
    {
        preg_match_all('#<(h1|h2)\b[^>]*>(.*?)</\1>#us', $this->kitHtml($kit), $matches);

        return array_values(array_filter(
            $matches[2],
            static fn (string $inner) => str_contains($inner, '<em>'),
        ));
    }

    private function kitHtml(string $kit): string
    {
        $path = resource_path('landing-kits/' . $kit . '/index.html');

        $this->assertFileExists($path, "The author's kit is missing: {$kit}");

        return (string) file_get_contents($path);
    }
}
