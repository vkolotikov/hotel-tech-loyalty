<?php
namespace Tests\Unit\Landing;

use Tests\TestCase;

/**
 * Guards for the four defects in the interactive layer that a PHP test can
 * see, all of which were found in a browser rather than here.
 *
 * These are deliberately assertions about the TEXT of two static files, which
 * is a weak form of test and is not pretending otherwise: the behaviour they
 * stand in for — a scroll-driven spine, an IntersectionObserver's sampling, a
 * class that gates a hiding rule — cannot be exercised without a layout
 * engine, and this suite has none. What they are good for is the thing that
 * actually went wrong each time: a single declaration or literal being changed
 * back, in a file where the consequence is invisible until someone opens the
 * page on the right viewport at the right scroll position. Each failure
 * message says what the page does when the line is wrong.
 */
class RuledPageInteractiveLayerTest extends TestCase
{
    /**
     * The stylesheet with its comments stripped.
     *
     * Every guard below reasons about what precedes a `{`, which is the
     * selector -- unless a comment is sitting there, in which case it is a
     * comment. A refactor that makes a rule unconditional and leaves a
     * commented-out copy of the old selector above it is exactly the shape a
     * refactor takes, and it satisfied the launcher guard until this.
     */
    private function css(): string
    {
        return preg_replace(
            '#/\*.*?\*/#s',
            '',
            file_get_contents(public_path('landing/ruled_page.css'))
        );
    }

    private function js(): string
    {
        return file_get_contents(public_path('landing/ruled_page.js'));
    }

    /**
     * The script with its comments stripped.
     *
     * Same reason as css(): a guard that asserts an approach is ABSENT must
     * not be satisfied, or defeated, by prose. The comment above the retract
     * explains at length why a ratio cannot work here, and naming the API it
     * is warning about was enough to fail the check that it is not being
     * used. Every comment in that file is a whole line, which is what makes
     * this crude strip safe; there is no URL or regex in it for the `//` rule
     * to bite.
     */
    private function jsCode(): string
    {
        $withoutBlocks = preg_replace('#/\*.*?\*/#s', '', $this->js());

        return preg_replace('#^\s*//.*$#m', '', $withoutBlocks);
    }

    /**
     * `animation` is a shorthand and animation-timeline is one of its
     * longhands, so the shorthand resets the timeline to auto. Marking only
     * the shorthand !important made that reset important too, and it then beat
     * the plain animation-timeline on the next line — the spine ran on the
     * document timeline, completed instantly, and painted a permanently full
     * brand line down the viewport at every scroll position. Worse than not
     * shipping it.
     */
    public function test_every_spine_animation_declares_its_timeline_at_the_same_weight(): void
    {
        preg_match_all(
            '/\.rule-progress\{([^}]*animation:[^}]*)\}/',
            $this->css(),
            $blocks
        );

        $this->assertNotEmpty($blocks[1], 'The reading spine declares no animation at all.');

        foreach ($blocks[1] as $block) {
            $shorthandImportant = (bool) preg_match('/animation:[^;}]*!important/', $block);
            $timelineImportant  = (bool) preg_match('/animation-timeline:[^;}]*!important/', $block);

            $this->assertSame(
                $shorthandImportant,
                $timelineImportant,
                'The animation shorthand RESETS animation-timeline, so the two must carry '
                . 'the same weight. Mismatched, the spine falls back to the document '
                . 'timeline and paints full at every scroll position: [' . trim($block) . ']'
            );
        }
    }

    /**
     * An IntersectionObserver fires only when a listed threshold is crossed.
     * The booking band is routinely taller than four viewports, so its ratio
     * never reaches 0.25 — with only [0, 0.25] the callback was delivered
     * exclusively at ratio ~0 and the bar never retracted across the whole
     * band, which is the one thing 3.9 asks the retract to do.
     */
    public function test_the_retract_is_a_sentinel_rather_than_a_ratio(): void
    {
        $js = $this->jsCode();

        $this->assertStringContainsString(
            "rootMargin: '-50% 0px -50% 0px'",
            $js,
            'The retract no longer collapses the root to the viewport midline. A ratio '
            . 'test cannot express this: intersectionRatio is visible area over TOTAL '
            . 'area, so a band taller than four viewports never reaches 0.25, and '
            . 'intersectionRect.height caps at the viewport -- leaving band heights that '
            . 'no threshold list can cover.'
        );

        // The arithmetic that had the dead zones, gone rather than merely
        // unused: it is the thing to reach for when this is next touched.
        $this->assertStringNotContainsString('intersectionRect.height', $js);
        $this->assertStringNotContainsString('intersectionRatio', $js);
    }

    /**
     * The rule that hides the bar has to be switched on by code that can also
     * switch it off. Keyed on a page-wide "js is running" class, a browser
     * without IntersectionObserver got the hiding and none of the revealing:
     * the page's only mobile CTA and tel: link translated off the bottom of
     * the screen, with their 64px still reserved.
     */
    public function test_the_bar_only_hides_where_something_can_reveal_it(): void
    {
        $css = $this->css();

        $this->assertMatchesRegularExpression(
            '/body\.bar-managed\s+\.rp-bar\{[^}]*translateY\(100%\)/',
            $css,
            'The action bar hides on some class other than bar-managed.'
        );

        // And the rule that puts it back. Deleting this one passed every
        // guard while leaving the bar permanently off-screen with its 64px
        // still reserved -- the same end state as the defect the hiding rule
        // is guarded for, reached from the other side.
        $this->assertMatchesRegularExpression(
            '/body\.bar-managed\s+\.rp-bar\.is-in\{[^}]*transform:\s*none/',
            $css,
            'Nothing reveals the action bar again, so hiding it is permanent.'
        );

        // And that class is set inside the branch that sets up the observers,
        // not before it.
        $js = $this->jsCode();
        $branch = strpos($js, 'if (bar && window.IntersectionObserver) {');
        $set    = strpos($js, "classList.add('bar-managed')");

        $this->assertNotFalse($branch, 'The action-bar block no longer guards on IntersectionObserver.');
        $this->assertNotFalse($set, 'Nothing sets bar-managed, so the bar can never hide.');
        $this->assertGreaterThan($branch, $set,
            'bar-managed is set before the IntersectionObserver guard, so a browser without '
            . 'one would hide the bar with nothing left to reveal it.');
    }

    /**
     * No rule may mix a :has() selector with one that does not use it.
     *
     * This is the general form of the defect that took the launcher and the
     * body padding down together on every engine without :has(): a selector
     * list is invalid AS A WHOLE if any one compound in it fails to parse, so
     * a plain selector sharing a rule with a :has() sibling inherits its
     * support requirement and stops working where the sibling would merely
     * have been skipped.
     *
     * Asserted over the whole stylesheet rather than over the two rules it was
     * found in, because "these two declarations are identical, merge them" is
     * an entirely reasonable thing for someone to do to any such pair, and the
     * damage is invisible on the machine doing the merging.
     */
    public function test_no_rule_makes_a_plain_selector_depend_on_has_support(): void
    {
        foreach ($this->rules() as $rule) {
            $selectors = array_values(array_filter(array_map(
                fn (string $selector) => trim(preg_replace('/\s+/', ' ', $selector)),
                explode(',', $rule[1])
            )));

            if (count($selectors) < 2) {
                continue;
            }

            $withHas    = array_filter($selectors, fn ($s) => str_contains($s, ':has('));
            $withoutHas = array_filter($selectors, fn ($s) => ! str_contains($s, ':has('));

            $this->assertTrue(
                $withHas === [] || $withoutHas === [],
                'This rule pairs a :has() selector with one that does not use it, so the '
                . 'plain one stops working wherever :has() is unsupported — the whole list '
                . 'is invalid, not just the compound that failed. Give them separate rules: ['
                . implode(', ', $selectors) . ']'
            );
        }
    }

    /**
     * Every rule in the stylesheet, as [selector list, declarations].
     *
     * `[^{}]*` on both halves means an at-rule prelude can never be captured
     * as a selector: a media block's contents contain braces, so the only
     * matches are the innermost rules, whatever they are nested inside.
     */
    private function rules(): array
    {
        preg_match_all('/([^{}]*)\{([^{}]*)\}/', $this->css(), $rules, PREG_SET_ORDER);

        return $rules;
    }

    /**
     * Every individual selector in the stylesheet that targets $needle, keyed
     * by itself, with the declarations its rule carries.
     *
     * SPLIT ON COMMAS, and that is the whole point of this method. Checking
     * the selector LIST as one string only ever asked whether the condition
     * appears somewhere in it, which
     *
     *     #htchat-launcher, body.has-actionbar #htchat-launcher{...}
     *
     * satisfies -- while the first selector in that list raises the launcher
     * unconditionally, which is exactly the defect being guarded against. It
     * is not an exotic shape either: it is what adding a second selector to an
     * existing rule looks like. Splitting first asks the question of every
     * selector separately, which closes the shape rather than the instance.
     *
     * @return array<string, string>
     */
    private function selectorsTargeting(string $needle): array
    {
        $found = [];

        foreach ($this->rules() as $rule) {
            foreach (explode(',', $rule[1]) as $selector) {
                $selector = trim(preg_replace('/\s+/', ' ', $selector));

                if ($selector !== '' && str_contains($selector, $needle)) {
                    $found[$selector] = $rule[2];
                }
            }
        }

        return $found;
    }

    /**
     * Does one selector make its rule conditional on the bar being on screen?
     *
     * Three spellings are legitimate, and no others: the class the script sets
     * while the bar is revealed, the class it sets while it is managing the
     * bar at all, and the :has() form that asks whether an unmanaged bar is in
     * the document.
     */
    private function tracksTheBar(string $selector): bool
    {
        return (bool) preg_match(
            '/(^|[\s>+~])body[^\s>+~]*\.(has-actionbar|bar-managed)|(^|[\s>+~])body[^\s>+~]*:has\(/',
            $selector
        );
    }

    /**
     * The chat corner's offset has to track the bar rather than the viewport
     * width. Unconditional, it left a 56px launcher floating 76px off the
     * bottom with nothing underneath it — over the whole booking band, which
     * is exactly where someone reaches for chat.
     *
     * The SUBJECT moved with the widget and the guard moved with it. While
     * the widget ran inside the page the launcher was the tenant's button
     * (#htchat-launcher) and the stylesheet's only business with it was its
     * offset, so "every rule that names it" and "every rule that offsets it"
     * were the same set. The widget is behind an origin boundary now and the
     * launcher is the template's own, so the sheet legitimately gives .rp-chat
     * a size, a colour and a shape — and the question narrows to the one it
     * was always really asking:
     *
     *   - exactly ONE rule sets the corner's resting offset, and
     *   - every rule that moves it by the BAR's height tracks the bar, and
     *     touches nothing else.
     *
     * The first half is new and closes a hole the old form had: a second
     * unconditional offset written under a media query used to be invisible
     * here, because selectorsTargeting() keys by selector and the duplicate
     * simply overwrote the original.
     */
    public function test_every_rule_that_offsets_the_chat_dock_tracks_the_bar(): void
    {
        $selectors = $this->selectorsTargeting('.rp-chat');

        $this->assertNotEmpty($selectors, 'Nothing styles the chat dock at all.');

        // Half one: the resting offset is declared once, on the dock's own
        // rule, and every OTHER rule that carries it is a duplicate.
        $resting = [];

        foreach ($this->rulesAbout('.rp-chat') as [$selector, $declarations]) {
            if (! preg_match('/(^|;)\s*(inset-block-end|bottom)\s*:/', $declarations)) {
                continue;
            }
            if (str_contains($declarations, '--bar-h')) {
                continue;   // a raise, covered by half two
            }

            $resting[] = $selector;
        }

        $this->assertSame(
            ['.rp-chat'],
            $resting,
            'The chat corner\'s resting offset must be declared exactly once, on the dock '
            . 'itself. A second one under a media query is an offset that only applies at '
            . 'one width, which is the shape the bar-tracking rules exist to avoid: ['
            . implode(', ', $resting) . ']'
        );

        // Half two: every raise is conditional on the bar being on screen.
        $raises = array_filter(
            $selectors,
            fn (string $declarations) => str_contains($declarations, '--bar-h')
        );

        $this->assertNotEmpty($raises, 'Nothing raises the chat dock clear of the action bar.');

        foreach ($raises as $selector => $declarations) {
            $this->assertTrue(
                $this->tracksTheBar($selector),
                'This selector raises the dock whether or not the bar is on screen, '
                . 'so it floats clear of nothing over most of the page: [' . $selector . ']'
            );

            // Nothing beyond the offset — 3.6 is emphatic: reposition, never
            // restyle. A size or a colour reaching in from a media query is a
            // second definition that only applies in one scroll state, and a
            // transition would animate the raise itself, so the launcher would
            // drift up the screen every time the bar appeared.
            foreach (explode(';', $declarations) as $declaration) {
                if (trim($declaration) === '') {
                    continue;
                }

                $this->assertMatchesRegularExpression(
                    '/^\s*--rp-chat-gap\s*:/',
                    $declaration,
                    'Only the dock\'s offset may be touched here, and it is one custom '
                    . 'property so the panel can measure its own height against the same '
                    . 'number: [' . trim($declaration) . ']'
                );
            }
        }
    }

    /**
     * The panel's height is measured back from the dock's offset rather than
     * from a copy of the bar's height, which is what makes the raise above a
     * single declaration. Written independently, the panel keeps its full
     * height when the bar pushes the dock up and runs off the top of a phone.
     */
    public function test_the_panel_sizes_itself_against_the_docks_own_offset(): void
    {
        $sized = 0;

        foreach ($this->rulesAbout('.rp-chat__panel') as [$selector, $declarations]) {
            if (! preg_match('/(^|;)\s*(max-)?block-size\s*:/', $declarations)) {
                continue;
            }

            $sized++;

            $this->assertStringContainsString(
                'var(--rp-chat-gap)',
                $declarations,
                'The panel is anchored to the dock, so its height must be measured back '
                . 'from the dock\'s own offset. A height that ignores it overruns the top '
                . 'of the screen the moment the action bar raises the corner: [' . $selector . ']'
            );
        }

        $this->assertGreaterThan(0, $sized, 'Nothing bounds the chat panel\'s height.');
    }

    /**
     * Every rule whose SUBJECT is $class — the element the rule actually
     * styles, which is the last compound of each selector in its list.
     *
     * selectorsTargeting() above cannot answer this: it matches a substring,
     * so `.rp-chat` also catches `.rp-chat__panel` and `.rp-chat__launcher`,
     * and it keys by selector, so two rules with the same selector under
     * different media queries collapse into one. Both matter here — the dock
     * and the panel are separately positioned elements whose class names are
     * prefixes of each other, and "declared exactly once" is a claim about
     * rules rather than about selectors.
     *
     * @return list<array{0: string, 1: string}> [selector, declarations]
     */
    private function rulesAbout(string $class): array
    {
        $found = [];

        foreach ($this->rules() as $rule) {
            foreach (explode(',', $rule[1]) as $selector) {
                $selector = trim(preg_replace('/\s+/', ' ', $selector));

                if ($selector === '') {
                    continue;
                }

                $compounds = preg_split('/[\s>+~]+/', $selector);
                $subject   = (string) end($compounds);

                // The subject may carry pseudo-classes and attribute
                // selectors of its own (:hover, [aria-expanded="true"]);
                // strip them, since the ELEMENT is still the same one.
                $subject = preg_replace('/[:\[].*$/', '', $subject);

                if ($subject === $class) {
                    $found[] = [$selector, $rule[2]];
                }
            }
        }

        return $found;
    }

    /**
     * The bar is fixed, so it cannot push anything: the document reserves its
     * height instead, and without that the bar covers the last 64px of the
     * page — where the footer keeps the legal links.
     *
     * BOTH rules are required, separately. They are the same declaration for
     * two different states, and they are deliberately not one comma list: a
     * selector list is invalid as a whole if any compound in it fails to
     * parse, so pairing them put the class-only rule at the mercy of :has()
     * support. Requiring each to stand on its own is what stops them being
     * merged back.
     */
    public function test_the_document_reserves_the_bars_height_in_both_resting_states(): void
    {
        $reserved = [];

        foreach ($this->rules() as $rule) {
            if (! preg_match('/padding-bottom:[^;}]*var\(--bar-h\)/', $rule[2])) {
                continue;
            }

            foreach (explode(',', $rule[1]) as $selector) {
                $reserved[trim(preg_replace('/\s+/', ' ', $selector))] = true;
            }
        }

        $this->assertArrayHasKey(
            'body.rp.has-actionbar',
            $reserved,
            "Nothing reserves the bar's height while the script has it revealed, so the "
            . "bar covers the last 64px of the document — the footer's legal links."
        );

        $this->assertArrayHasKey(
            'body.rp:has(.rp-bar):not(.bar-managed)',
            $reserved,
            "Nothing reserves the bar's height where no script manages it, which is the "
            . "state every engine without :has() is also in."
        );

        // And none of them may be unconditional: a rule that reserves the
        // height with the bar retracted is 64px of dead space at the end of
        // the page.
        foreach (array_keys($reserved) as $selector) {
            $this->assertTrue(
                $this->tracksTheBar($selector),
                "This selector reserves the bar's height whether or not the bar is on "
                . "screen: [" . $selector . "]"
            );
        }
    }
}
