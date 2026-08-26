<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Dimension ceiling without an image library. The pipeline has no
 * intervention/spatie/imagick and GD is unreliable in production, but
 * getimagesize() is core PHP: it reads only the header, never decodes the
 * pixels, so this costs microseconds and works everywhere. The browser is
 * expected to downscale before upload; this rule is the backstop for the
 * client that did not.
 */
class MaxImageDimensions implements ValidationRule
{
    public function __construct(private readonly int $maxEdge) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $path = is_object($value) && method_exists($value, 'getRealPath')
            ? $value->getRealPath()
            : null;

        // getimagesize() returns false for content it cannot parse as an
        // image, but for a genuinely empty or truncated file it ALSO emits
        // an E_WARNING ("Error reading from ...") — and this app's error
        // handler promotes warnings to a thrown ErrorException, which would
        // turn "please pick a real photo" into a 500. The @ only silences
        // that warning; the false-check below is what actually decides.
        $size = ($path !== null && is_file($path)) ? @getimagesize($path) : false;

        if ($size === false) {
            $fail('We could not read that image. Please upload a JPEG, PNG or WebP photo.');
            return;
        }

        if (max($size[0], $size[1]) > $this->maxEdge) {
            $fail("That image is very large — please use one up to {$this->maxEdge} pixels on its longest side.");
        }
    }
}
