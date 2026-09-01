<?php

namespace App\Landing;

use Illuminate\Support\HtmlString;

/**
 * THE TWO TYPOGRAPHIC GESTURES A KIT HEADING MAKES, AND THE ONLY PERMITTED
 * ROUTE TO EITHER (template fidelity 5.1 / R6 / R7).
 *
 * The author's display headings are not plain strings. Across the six kits
 * they do two things a `{{ $heading }}` cannot:
 *
 *   1. THEY BREAK. Kit 01 breaks all four of its display headings ("Let the
 *      day / fall away."), and eleven of the hospitality kits' thirteen do
 *      the same. Blade escapes the newline a tenant types, so the conversion
 *      printed one long line where the author drew two.
 *   2. THEY EMPHASISE A TRAILING FRAGMENT. Kit 02 italicises a phrase in two
 *      headings and kit 03 in all eight — `<em>` set in the accent colour at
 *      `font-weight: 400`, which IS kit 03's typographic identity. Kit 01's
 *      own stylesheet carries the same treatment (`.text-hero h2 em`,
 *      `nocturne_ritual.css:1510`) for a band his mock never used.
 *
 * BOTH ARE MARKUP, AND MARKUP MAY NOT COME OUT OF TENANT COPY. Three tests
 * (NocturneRitualRenderTest) scan every blade file under a kit template for
 * the raw-echo delimiter, because a landing page is a public marketing
 * origin serving customer-supplied strings and a raw echo there is stored
 * XSS. So the markup is built HERE, out of already-escaped fragments, and
 * handed to the partial as an Htmlable:
 *
 *     <h2>{{ Copy::heading($copy['heading'], $copy['heading_accent']) }}</h2>
 *
 * Laravel's `e()` returns early for an Htmlable, so nothing is double
 * escaped and no partial has to contain a raw echo to print a `<br>`.
 *
 * THIS IS THE ONLY DOOR. The risk R7 names is that the NEXT person who wants
 * a `<br>` in a heading reaches for the raw echo instead. Everything a kit
 * heading is allowed to contain is in this file; anything not in this file
 * is not allowed, and the three scanning tests are what enforce that.
 */
final class Copy
{
    /**
     * How many line breaks one heading leaf may carry.
     *
     * ONE, and it is a design bound rather than a safety one. Every display
     * heading in all six kits breaks at most once — a heading is a
     * composition the author sized for two lines, and a tenant who pastes a
     * paragraph into it would otherwise push the band's own photograph off
     * the screen. Fragments past the bound are not DROPPED (losing a
     * tenant's words silently is worse than an ugly line); they are rejoined
     * to the last line with a space, which is what the heading looked like
     * before this helper existed.
     */
    public const MAX_BREAKS = 1;

    /**
     * A heading leaf, escaped, with the tenant's own line break honoured.
     *
     * `\R` is any line ending, so a page edited on Windows behaves like one
     * edited anywhere else, and a run of blank lines is one break rather
     * than three empty ones. Each fragment is escaped individually and the
     * only thing this method ever puts between two of them is the literal
     * `<br>` the author's own markup uses — there is no path by which a
     * character out of `$value` reaches the page unescaped.
     */
    public static function lines(?string $value, int $maxBreaks = self::MAX_BREAKS): HtmlString
    {
        $fragments = self::fragments($value, $maxBreaks);

        return new HtmlString(implode('<br>', array_map(static fn ($line) => e($line), $fragments)));
    }

    /**
     * A heading and its companion emphasis — the `_accent` leaf R6 settles
     * on — as the author writes them.
     *
     * WHY A COMPANION LEAF AND NOT MARKUP IN THE COPY: see the class note.
     * The editor gets an honest second input ("Words to highlight"), the
     * scanning tests stay green, and a blank accent produces no `<em>` at
     * all rather than an empty one — so a tenant who writes nothing there
     * gets exactly the heading they had before the leaf existed.
     *
     * VERIFIED, NOT ASSUMED. R6's claim that the emphasis is a TRAILING
     * fragment rested on a transcription. It was re-checked against all six
     * `index.html` files: thirteen headings across five kits carry an `<em>`
     * and the emphasised run is the tail of the heading in all thirteen.
     * (The four non-trailing `<em>`s in those files are inside brand
     * WORDMARKS — kit 03's `Morrow <em>&</em> Moss` — which are derived from
     * the business name and are not heading leaves at all. See CopyTest.)
     *
     * THE BREAK BEFORE THE EMPHASIS is the one shape the trailing rule alone
     * does not reproduce. Three of the hospitality heroes put the emphasised
     * half on its OWN line (`Come hungry.<br><em>Leave slowly.</em>`), and a
     * tenant asks for that with the gesture they already know: a line break
     * at the end of the heading. It costs the same break budget as any
     * other, so a heading is still at most two lines.
     */
    public static function heading(?string $heading, ?string $accent = null): HtmlString
    {
        $accent = trim((string) $accent);
        $raw    = (string) $heading;

        // Does the tenant want the emphasis on a line of its own? Asked of
        // the RAW value, before fragments() trims the trailing break away.
        // Only meaningful with an accent to place: a trailing break on a
        // heading with nothing after it is whitespace, not a line.
        $breaksBeforeAccent = $accent !== '' && preg_match('/\R\s*$/u', $raw) === 1;

        // The heading's own break budget is spent on the accent's line when
        // it asks for one, so `A<br>B <em>C</em>` is not reachable: two
        // lines is two lines however the tenant spells it.
        $head = self::lines($raw, self::MAX_BREAKS - ($breaksBeforeAccent ? 1 : 0))->toHtml();

        if ($accent === '') {
            return new HtmlString($head);
        }

        $em = '<em>' . e($accent) . '</em>';

        if ($head === '') {
            return new HtmlString($em);
        }

        return new HtmlString($head . ($breaksBeforeAccent ? '<br>' : ' ') . $em);
    }

    /**
     * A BUSINESS'S NAME, SET AS A WORDMARK — the one emphasis in these kits
     * that is INFIX rather than trailing, and the one `_accent` cannot
     * express (template fidelity 8.x).
     *
     * Kit 03's lockup is `Morrow <em>&amp;</em> Moss`, in its header and
     * again in its footer, with `.brand__name em { color: var(--color-clay) }`
     * — the conjunction set in the accent colour and in the display face's
     * italic. R6's own survey found it and said so: it is one of only four
     * `<em>`s in the six kits that is not a heading, and the only one whose
     * emphasis falls in the MIDDLE.
     *
     * IT IS NOT A LEAF AND MUST NOT BECOME ONE. The wordmark is derived from
     * the business's own name (`$brandName` in every kit layout — the
     * Property's name, else the page's SEO title), which is chrome: there is
     * no `content.header.*`, `footer` has no row a control could hang on,
     * and an infix needs a POSITION as well as a fragment, so a second
     * `_accent`-shaped leaf could not express it even if there were somewhere
     * to put one.
     *
     * SO IT IS DERIVED FROM THE NAME ITSELF, and the derivation is as narrow
     * as it can be: a single `&` standing alone between two words. That is
     * the author's own case and a very common shape for a studio's name
     * ("Morrow & Moss", "Hart & Bloom"), it is unambiguous, and it is a
     * TYPOGRAPHIC treatment of a conjunction rather than a guess about
     * meaning. A name with no such ampersand renders exactly as it always
     * did, which is what every other business gets.
     *
     * ONE, AND ONLY THE FIRST. "Body & Soul & Co" emphasises the first
     * ampersand and prints the second as a plain character: two italic
     * conjunctions in one lockup is not a design either author drew.
     *
     * ESCAPED THE SAME WAY EVERYTHING ELSE HERE IS. Both sides are escaped
     * individually and the only thing this method ever puts between them is
     * the literal `<em>` and an escaped `&` — there is no path by which a
     * character out of `$name` reaches the page unescaped, so no partial has
     * to contain a raw echo to draw the author's lockup.
     */
    public static function wordmark(?string $name): HtmlString
    {
        // Flattened first: a wordmark is one line by construction, and a
        // newline a tenant left in their business name must not become a
        // break in a header lockup.
        $flat = self::plain($name);

        // The FIRST ampersand that stands alone between two words. Not
        // greedy, so "A & B & C" emphasises the first; \S on both sides, so
        // an ampersand inside a word ("R&D") is left exactly as typed.
        if (preg_match('/^(.*?\S)\s+&\s+(\S.*)$/u', $flat, $parts) !== 1) {
            return new HtmlString(e($flat));
        }

        return new HtmlString(e($parts[1]) . ' <em>' . e('&') . '</em> ' . e($parts[2]));
    }

    /**
     * The heading, flattened to a single line with no markup at all — for
     * the places a heading is used as a VALUE rather than as display type:
     * an `aria-label`, a `<title>`, an `og:title`, a JSON-LD field.
     *
     * A raw echo of the leaf would put a literal newline in an attribute,
     * which collapses to a space in some readers and survives in others;
     * this makes the answer the same everywhere. The accent is appended
     * because it is part of the sentence the heading says, even where the
     * two-tone treatment cannot be drawn.
     */
    public static function plain(?string $heading, ?string $accent = null): string
    {
        $accent = trim((string) $accent);
        $lines  = self::fragments($heading, PHP_INT_MAX);

        if ($accent !== '') {
            $lines[] = $accent;
        }

        return implode(' ', $lines);
    }

    /**
     * The heading's lines: trimmed, blanks closed up, and everything past
     * the bound rejoined onto the last one rather than dropped.
     *
     * @return list<string>
     */
    private static function fragments(?string $value, int $maxBreaks): array
    {
        $lines = array_values(array_filter(
            array_map(
                static fn ($line) => trim((string) $line),
                preg_split('/\R+/u', (string) $value) ?: [],
            ),
            static fn (string $line) => $line !== '',
        ));

        $maxLines = max(1, $maxBreaks === PHP_INT_MAX ? PHP_INT_MAX : $maxBreaks + 1);

        if (count($lines) > $maxLines) {
            $lines = [
                ...array_slice($lines, 0, $maxLines - 1),
                implode(' ', array_slice($lines, $maxLines - 1)),
            ];
        }

        return $lines;
    }
}
