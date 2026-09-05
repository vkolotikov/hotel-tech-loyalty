<?php
namespace App\Landing;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * The shared `theme` allowlist (landing phase 3c, D6).
 *
 * Before this class, `LandingPageController::update()` validated `theme`
 * only as `array` + `ScalarLeaves(depth: 1)` — SHAPE, not membership or
 * FORMAT, so any flat scalar key was silently accepted and stored
 * (`test_non_string_scalars_are_still_accepted`'s old `theme.radius`/
 * `theme.dark` proved it). `LandingOnboardingController::store()` had the
 * opposite gap: it format-checked its own keys but named no shared source
 * for the rules, so a second write surface would have needed a second copy
 * of "what may `theme` contain".
 *
 * One constant, one rule set, one message set — read by both controllers
 * and by the live preview — so the write surfaces cannot drift apart about
 * what `theme` is allowed to contain. Render-time re-whitelisting
 * (`Accent::for()`) stays as its own, independent defense-in-depth layer —
 * this class is the write-time gate, not a replacement for the read-time
 * one.
 *
 * ONE KEY. `theme` used to carry three — `brand_color`, `font_pairing` and
 * `palette` — and the last two were the generic house design's controls:
 * six curated palettes and four type pairings that only that design's
 * layout ever read. That design is retired and deleted; the six kits each
 * ship their author's own `:root` and read neither key, so neither is
 * accepted any more. A stored `palette` or `font_pairing` left on a row
 * from before the retirement is inert (every kit render test pins that a
 * stored one emits nothing) and washes out on the next save, because the
 * editor sends only the keys this class names. An API caller who echoes
 * one back gets the same unknown-key refusal any other stray key gets —
 * which is exactly what makes this class worth keeping at one key: the
 * REFUSAL is the contract, and a `theme` that accepted anything flat would
 * be a schemaless column again.
 */
final class ThemeRules
{
    /**
     * The only key `theme` may carry: the tenant's accent, the ONE override
     * every kit was converted to honour.
     */
    public const KEYS = ['brand_color'];

    /** @return list<string> */
    public static function keys(): array
    {
        return self::KEYS;
    }

    /**
     * The per-key Laravel rules. `brand_color` is a free-form string up to
     * 32 characters — a LENGTH guard, not a format one: `Accent::for()`
     * re-validates the actual colour syntax at render time, and a value it
     * cannot read degrades to the industry's own accent rather than to an
     * error.
     */
    public static function rules(): array
    {
        return [
            'brand_color' => ['nullable', 'string', 'max:32'],
        ];
    }

    /**
     * Friendly text for every rule above — the house rule this whole class
     * exists to keep (spec §9's "slug must never leak" lesson, applied
     * here the same way the `content.contact.*` messages already are):
     * Laravel's own defaults spell the field name, and that is not
     * something a tenant editing a marketing page should read.
     */
    public static function messages(): array
    {
        return [
            'brand_color.string' => 'Please enter a valid accent colour.',
            'brand_color.max'    => 'Please enter a shorter accent colour.',
        ];
    }

    /**
     * Validates an untrusted, already-confirmed-to-be-an-array `theme`
     * value against the allowlist above and throws a
     * `ValidationException` the same way `$request->validate()` would.
     *
     * A key-diff check first, refusing with one message that never names
     * the offending key (the same "no field-name leakage" reasoning as
     * every other message in this class) — THEN a `Validator::make()`
     * call for the keys that are actually present.
     *
     * Deliberately a SEPARATE `Validator` instance, never rules keyed
     * `'theme.brand_color'` added as siblings inside the SAME
     * `$request->validate()` call that already validates `theme` itself
     * as `array`: that is the phase-3a trap
     * (`Validator::$excludeUnvalidatedArrayKeys`, on by default since
     * Laravel 9) — the moment ANY dotted rule names one child of an array
     * field, every child the dotted rules do NOT enumerate is silently
     * dropped from `validated()`'s result, with no exception and no 422.
     * For `content` that trap meant whole sections vanishing
     * (`test_a_contact_write_does_not_erase_sibling_sections` pins the
     * fix); for `theme` it would mean an unlisted key being silently
     * stripped instead of refused — the opposite of what D6 asks for,
     * since the requirement here is a 422, not a quiet drop. Calling this
     * method against `theme` as its own independent array — never adding
     * `'theme.*'` rules to a request-level `validate()` array — sidesteps
     * the mechanism that causes either failure mode.
     */
    public static function validate(array $theme): void
    {
        $unknown = array_diff(array_keys($theme), self::KEYS);

        if ($unknown !== []) {
            throw ValidationException::withMessages([
                'theme' => 'Please choose a valid design option.',
            ]);
        }

        Validator::make($theme, self::rules(), self::messages())->validate();
    }
}
