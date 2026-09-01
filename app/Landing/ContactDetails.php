<?php

namespace App\Landing;

use App\Models\Property;

/**
 * The contact facts a landing page publishes, resolved once.
 *
 * Two sources answer "what is this business's phone number": the tenant's
 * Property row, and per-page overrides typed into the builder (stored under
 * content.contact). Before this class, blades read the Property directly,
 * which is why the wizard could only say "go edit it somewhere else" - and
 * why that somewhere was misnamed. Field-level precedence lives here and
 * nowhere else: an override wins for its own field; a BLANK override is
 * absence, not erasure, so clearing a field in the builder falls back to
 * the Property instead of blanking the public page.
 *
 * Only phone, email and address are overridable - they are what a tenant
 * needs to correct per-page. The rest (name, city, country, currency,
 * timezone) pass through the Property untouched; JSON-LD and the services
 * currency read them and must keep meaning "the business", not "this page".
 *
 * Overrides arrive from a schemaless JSON column, so resolve() treats any
 * non-string as absent rather than fatal - the public page must degrade,
 * never 500 (the ScalarLeaves/ScalarTree lesson from Phase 2).
 */
final class ContactDetails
{
    public function __construct(
        public readonly ?string $name,
        public readonly ?string $phone,
        public readonly ?string $email,
        public readonly ?string $address,
        public readonly ?string $city,
        public readonly ?string $country,
        public readonly ?string $currency,
        public readonly ?string $timezone,
        /**
         * THE BUSINESS'S OWN LOGO (template fidelity 4.6), or null.
         *
         * No landing file read a logo anywhere before this: the header and
         * the footer both derived a MONOGRAM from the first letter of the
         * business name, and a tenant with a real logo had nowhere to put it
         * on any of the three kits.
         *
         * NO NEW UPLOAD SLOT, deliberately. `Brand.logo_url` already exists,
         * is already tenant-uploadable (BrandController accepts SVG), and is
         * already what the admin shell paints its own chrome with — so this
         * is a READ of something the tenant has already given us rather than
         * a fourth place to ask for it. It is resolved beside the Property's
         * facts because it answers the same question they do ("what does the
         * page say this business is"), and because the two are wanted
         * together at every call site.
         *
         * Not overridable per page: a logo is the business's identity, not a
         * per-page detail like the phone number a branch might correct.
         *
         * Guarded like every other URL this page renders — same-origin
         * storage or an explicit http(s) URL, nothing else — because
         * `logo_url` is a plain string column and a `javascript:` value in it
         * would otherwise reach an <img src> on a public page.
         */
        public readonly ?string $logoUrl = null,
    ) {}

    /**
     * THE THREE FACTS A PAGE MAY OVERRIDE — the `$overrides` keys
     * {@see resolve()} consults, named so the one other place that needs to
     * know reads them rather than repeating them.
     *
     * That place is `LandingOnboardingService::contentFieldsFor()`, which
     * derives per-template field lists by reading what each partial indexes.
     * These three are the exception it has to be told about: they are
     * resolved HERE, before any partial is reached, so no partial indexes
     * them and a scan alone would conclude no design offers them.
     *
     * @return list<string>
     */
    public static function overridableFields(): array
    {
        return ['phone', 'email', 'address'];
    }

    /**
     * @param string|null $logoUrl the brand's own `logo_url`, raw — validated
     *                             here rather than at the call site, so every
     *                             caller gets the same allowlist
     */
    public static function resolve(?Property $property, array $overrides, ?string $logoUrl = null): self
    {
        $pick = static function (string $key) use ($property, $overrides): ?string {
            $o = $overrides[$key] ?? null;
            if (is_string($o) && trim($o) !== '') {
                return trim($o);
            }
            $p = $property?->{$key};
            return is_string($p) && trim($p) !== '' ? $p : null;
        };

        return new self(
            name:     is_string($property?->name) ? $property->name : null,
            phone:    $pick('phone'),
            email:    $pick('email'),
            address:  $pick('address'),
            city:     is_string($property?->city) ? $property->city : null,
            country:  is_string($property?->country) ? $property->country : null,
            currency: is_string($property?->currency) ? $property->currency : null,
            timezone: is_string($property?->timezone) ? $property->timezone : null,
            logoUrl:  self::safeLogo($logoUrl),
        );
    }

    /**
     * The same three guards {@see PageContent::imageUrl()} applies to every
     * photograph on the page, applied to the logo — a string, bounded, and
     * either same-origin storage or an explicit http(s) URL.
     *
     * Repeated here rather than reached for across classes because this is
     * the only value in this class that becomes a `src`, and a guard that
     * only ONE of the two readers makes is a guard the other one does not
     * have. Deliberately `^(https?://|/storage/)` and not `^//` or a bare
     * `^/`: a protocol-relative `//evil.example/logo.svg` inherits the page's
     * scheme and is exactly as capable of pointing off-origin as a fully
     * qualified cross-origin URL.
     */
    private static function safeLogo(?string $url): ?string
    {
        if (!is_string($url) || $url === '' || strlen($url) > 2048) {
            return null;
        }

        return preg_match('#^(https?://|/storage/)#', $url) === 1 ? $url : null;
    }
}
