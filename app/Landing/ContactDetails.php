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
    ) {}

    public static function resolve(?Property $property, array $overrides): self
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
        );
    }
}
