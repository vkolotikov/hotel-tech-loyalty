<?php
namespace App\Support;

use App\Models\Organization;
use Illuminate\Support\Str;

/**
 * A landing-page slug is the tenant's public address, in a namespace shared
 * with every other tenant and with our own route prefixes.
 */
final class LandingSlug
{
    public const MIN = 3;
    public const MAX = 63;

    public static function normalise(string $value): string
    {
        // Str::slug transliterates, so "Café Mimi" becomes "cafe-mimi" rather
        // than losing the word.
        return Str::slug(trim($value), '-');
    }

    public static function isValid(string $value): bool
    {
        if (strlen($value) < self::MIN || strlen($value) > self::MAX) {
            return false;
        }

        // The D modifier is load-bearing. Without it PCRE lets `$` match
        // just before a TRAILING NEWLINE, so "glamour-salon\n" validates
        // as clean. That matters because isValid() is not only an input
        // filter: the public renderer calls it on a slug read back OUT of
        // the database before building a redirect from it, and a smuggled
        // control character there lands inside a Location header value.
        return (bool) preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $value);
    }

    public static function isReserved(string $value): bool
    {
        $reserved = array_map('strtolower', config('landing.reserved_slugs', []));

        // Industry ids come from the model rather than being copied here; a
        // second hand-maintained list is how the two drift apart. They are
        // run through the same normalise() a slug goes through, because
        // 'real_estate' is stored with an underscore but 'real-estate' is
        // the only form a tenant's slug could ever actually take.
        $industries = array_map(
            static fn (string $industry): string => self::normalise($industry),
            Organization::INDUSTRIES
        );

        return in_array(strtolower($value), array_merge($reserved, $industries), true);
    }
}
