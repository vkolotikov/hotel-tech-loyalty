<?php

namespace App\Support;

/**
 * The shape a tenant-authored JSON column is allowed to have: a map, nested a
 * fixed number of levels, whose leaves are all scalars.
 *
 * landing_pages.theme, .content and .seo are `array` casts with no schema
 * behind them, and the renderer reads their leaves as strings — theme
 * .brand_color goes into Accent::for(?string ...) and every copy leaf is
 * echoed through Blade's e(), which is htmlspecialchars() with a `string`
 * parameter. An ARRAY leaf therefore does not render badly, it throws a
 * TypeError: HTTP 500 on a live public marketing page, from stored data,
 * on every request until somebody edits the row. Preview shares the render
 * path, so the tenant cannot even see what they broke.
 *
 * Two callers, deliberately answering that differently:
 *
 *   - the admin API REFUSES the write ({@see \App\Rules\ScalarLeaves}), so a
 *     person gets a message naming the field while they are still looking at
 *     it;
 *   - the renderer PRUNES what it reads ({@see prune()}), because rows
 *     written before that rule existed are already in the database and a
 *     public page must never 500 on stored data, whatever is in the column.
 *
 * Both questions are asked of the same walk here so the two halves cannot
 * drift into disagreeing about what a legal column looks like.
 *
 * $depth is how many levels of array the shape legitimately HAS, not a
 * recursion guard: 1 for a flat map of fields (theme, seo), 2 for a map of
 * section keys onto a flat map of fields (content, which the layout reads as
 * $page->content[$section->key] and hands to a partial as $copy). Arrays
 * below that are what this class exists to catch.
 */
final class ScalarTree
{
    /**
     * The path to the first value that is nested deeper than $depth allows,
     * or null if the whole tree is legal.
     *
     * A path rather than a bool: "theme is invalid" sends a non-technical
     * user hunting through a JSON blob, "hero → headline" does not.
     *
     * @return list<string>|null
     */
    public static function firstNesting(mixed $value, int $depth): ?array
    {
        return self::walk($value, [], $depth);
    }

    /**
     * The same tree with every over-nested value dropped rather than refused.
     *
     * Dropped, not coerced: a leaf stringified to "Array" would be published
     * as the business's own headline or <title>. Absent is a state every
     * reader already handles — the template's `??` chains fall through to the
     * next candidate, which is exactly what a tenant who has filled nothing in
     * already gets.
     */
    public static function prune(mixed $value, int $depth): array
    {
        if (!is_array($value)) {
            return [];
        }

        $clean = [];

        foreach ($value as $key => $child) {
            if (is_array($child)) {
                // An array where the shape has no more levels to give is the
                // over-nested value; below that, recurse and keep the scalars.
                if ($depth > 1) {
                    $clean[$key] = self::prune($child, $depth - 1);
                }

                continue;
            }

            if (is_scalar($child) || $child === null) {
                $clean[$key] = $child;
            }
        }

        return $clean;
    }

    /** @return list<string>|null */
    private static function walk(mixed $value, array $path, int $budget): ?array
    {
        if (!is_array($value)) {
            // Scalars and null are leaves at any depth. Everything else —
            // an object a future writer decodes with JSON_OBJECT_AS_ARRAY
            // off, a resource — is as unprintable as an array is.
            return is_scalar($value) || $value === null ? null : $path;
        }

        if ($budget <= 0) {
            return $path;
        }

        foreach ($value as $key => $child) {
            $found = self::walk($child, [...$path, (string) $key], $budget - 1);

            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }
}
