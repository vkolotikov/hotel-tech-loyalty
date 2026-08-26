<?php
namespace App\Landing;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * D6's shared `theme` allowlist (landing phase 3c).
 *
 * Before this class, `LandingPageController::update()` validated `theme`
 * only as `array` + `ScalarLeaves(depth: 1)` — SHAPE, not membership or
 * FORMAT, so any flat scalar key was silently accepted and stored
 * (`test_non_string_scalars_are_still_accepted`'s old `theme.radius`/
 * `theme.dark` proved it). `LandingOnboardingController::store()` had the
 * opposite gap: it format-checked `brand_color`/`font_pairing` but named no
 * shared source for those two rules, so Task 1's new `palette` key would
 * have needed a THIRD copy of "what does a valid palette look like" the
 * moment anything else wanted to check it.
 *
 * One constant, one rule set, one message set — read by both controllers —
 * so Task 3 (adding the `grand` font pairing) and Plan B (adding `locale`)
 * each touch this file alone and the two write surfaces cannot drift apart
 * about what `theme` is allowed to contain. Render-time re-whitelisting
 * (Accent, the font-pairing switch in layout.blade.php, `Palette::for()`)
 * stays as its own, independent defense-in-depth layer — this class is the
 * write-time gate, not a replacement for the read-time one.
 */
final class ThemeRules
{
    /**
     * The only keys `theme` may ever carry. Exactly D6's `{brand_color,
     * font_pairing, palette}` — Plan B adds `locale` here (and to rules()
     * below) so the two plans cannot disagree about the allowlist.
     */
    public const KEYS = ['brand_color', 'font_pairing', 'palette'];

    /**
     * The pairings allowed today. Task 3 adds `grand` here — and ONLY
     * here — per this task's brief: editing this one array is what makes
     * `font_pairing` accept the fourth pairing everywhere `rules()` is
     * consulted, with no second allowlist to remember to update.
     */
    public const FONT_PAIRINGS = ['editorial', 'modern', 'classic', 'grand'];

    /** Exactly D6's `{brand_color, font_pairing, palette}`, in that order. */
    public static function keys(): array
    {
        return self::KEYS;
    }

    /**
     * The per-key Laravel rules. `brand_color` is unchanged from what
     * `LandingOnboardingController::store()` already enforced (a free-form
     * string up to 32 characters — `Accent::for()` re-validates the actual
     * colour syntax at render time, so this is a length guard, not a format
     * one). `font_pairing` and `palette` are each an allowlist against this
     * class's own constant and {@see Palette::ids()} respectively — never a
     * hand-copied list, so the six palette ids can only ever come from one
     * place.
     */
    public static function rules(): array
    {
        return [
            'brand_color'  => ['nullable', 'string', 'max:32'],
            'font_pairing' => ['nullable', 'string', Rule::in(self::FONT_PAIRINGS)],
            'palette'      => ['nullable', 'string', Rule::in(Palette::ids())],
        ];
    }

    /**
     * Friendly text for every rule above — the house rule this whole class
     * exists to keep (spec §9's "slug must never leak" lesson, applied
     * here the same way the `content.contact.*` messages already are):
     * Laravel's own default for a failed `in` rule spells the field name
     * and lists the raw allowed values verbatim ("The selected font
     * pairing is invalid." at best, "The selected theme.palette is
     * invalid." at worst if a dotted key is ever named in a rule set), and
     * neither is something a tenant editing a marketing page should read.
     */
    public static function messages(): array
    {
        return [
            'brand_color.string'  => 'Please enter a valid accent colour.',
            'brand_color.max'     => 'Please enter a shorter accent colour.',
            'font_pairing.string' => 'Please choose one of the available type pairings.',
            'font_pairing.in'     => 'Please choose one of the available type pairings.',
            'palette.string'      => 'Please choose one of the available looks.',
            'palette.in'          => 'Please choose one of the available looks.',
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
     * `'theme.palette'` etc. added as siblings inside the SAME
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
