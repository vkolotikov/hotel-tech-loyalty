<?php

namespace App\Support;

/**
 * Normalises a colour before it is written into a stylesheet.
 *
 * Blade's {{ }} escapes for HTML, which is the wrong alphabet here. Inside a
 * <style> element nothing needs escaping to be dangerous — a value of
 * "#fff} * {background:url(...)}" closes the declaration it was placed in and
 * opens a rule of the author's choosing, using no character {{ }} touches. And
 * because <style> is a raw text element, the entities {{ }} does produce are
 * never decoded, so escaping neither prevents the injection nor allows a
 * breakout into HTML.
 *
 * Validation at write time does not help either: these colours arrive as
 * query-string parameters on public widget routes, so they never meet a
 * validator. Normalising at render time is what actually closes it, and it has
 * the useful side effect of repairing values already sitting in the database.
 *
 * The output is always a six-digit hex. Callers append their own alpha —
 * lead-form.blade.php writes "{{ $color }}33" — and an eight-digit input would
 * otherwise produce a ten-digit string the browser discards.
 */
final class CssColor
{
    /** Matches the platform's own default so a rejected value looks deliberate. */
    public const FALLBACK = '#2d6a4f';

    public static function safe(?string $value, string $fallback = self::FALLBACK): string
    {
        $candidate = trim((string) $value);

        if ($candidate === '') {
            return $fallback;
        }

        // Hex only. Named colours and rgb()/hsl() are not accepted: they widen
        // the grammar for no benefit, since every colour picker in the admin
        // emits hex, and a wider grammar is a wider hole.
        if (!preg_match('/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $candidate, $m)) {
            return $fallback;
        }

        $hex = $m[1];

        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }

        if (strlen($hex) === 8) {
            $hex = substr($hex, 0, 6);
        }

        return '#' . strtolower($hex);
    }
}
