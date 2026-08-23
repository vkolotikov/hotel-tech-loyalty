<?php

namespace App\Rules;

use App\Support\ScalarTree;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A tenant-authored JSON column may nest exactly as deep as its renderer
 * reads, and no deeper — see {@see ScalarTree} for why an array leaf is a 500
 * on a live page rather than a cosmetic problem.
 *
 * A bare `array` rule constrains only the outermost value, so this is the
 * half of the fix that stops the bad row being written at all. The renderer's
 * pruning is the half that keeps rows written BEFORE this rule renderable.
 */
final class ScalarLeaves implements ValidationRule
{
    /** @param int $depth Levels of nesting the shape legitimately has. */
    public function __construct(private readonly int $depth = 1) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $path = ScalarTree::firstNesting($value, $this->depth);

        if ($path === null) {
            return;
        }

        // Named, not counted: the person on the other end of this is filling
        // in a marketing page, not debugging JSON, and "theme is invalid"
        // gives them nothing to act on. Only the first offender is reported —
        // a list of paths reads as a stack trace.
        $label = $path === [] ? $attribute : implode(' → ', $path);

        $fail(sprintf(
            '“%s” must be a single value, not a list. Enter one value there and try again.',
            $label,
        ));
    }
}
