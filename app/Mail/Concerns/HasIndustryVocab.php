<?php

namespace App\Mail\Concerns;

use App\Models\Organization;
use App\Services\IndustryPrompts\IndustryPromptService;

/**
 * Industry Platform Plan Phase 8 — Mailable trait that exposes the
 * org's industry-aware vocabulary in a single one-liner.
 *
 * Usage from a Mailable's `content()` method:
 *
 *     ->with([
 *         'hotelName' => $this->organization->name,
 *         ...$this->industryVocabFor($this->organization),
 *     ])
 *
 * That spreads three view variables:
 *
 *   - `$nouns`        — Phase 7 noun map ($nouns['guest'] etc.)
 *   - `$industry`     — canonical industry id
 *   - `$profile`      — full IndustryPromptProfile (Blade can read
 *                       workspaceLabel / passLabel / hasLoyalty)
 *
 * Pre-Phase-8 Mailables had no vocab handoff — every Blade was
 * literal hotel English. Pass-through for hotel orgs is exact
 * because the hotel profile carries an empty noun map.
 *
 * Defensive: never throws. A missing / unbound / null Organization
 * returns the hotel profile's vocab — same as if industry='hotel'
 * was passed explicitly.
 */
trait HasIndustryVocab
{
    /**
     * @return array{nouns: array<string,string>, industry: string, profile: \App\Services\IndustryPrompts\IndustryPromptProfile}
     */
    protected function industryVocabFor(?Organization $org): array
    {
        $industry = $org?->resolved_industry ?? Organization::DEFAULT_INDUSTRY;
        $profile  = app(IndustryPromptService::class)->for($industry);
        return [
            'nouns'    => $this->expandNouns($profile->nouns),
            'industry' => $industry,
            'profile'  => $profile,
        ];
    }

    /**
     * Expand the raw noun map into the keys Blades actually look up.
     * Profile carries canonical English keys ('guest', 'room', 'stay')
     * but a Blade is more readable with semantic keys ('end_user',
     * 'resource', 'time_unit'). Map both so Blades can use either.
     *
     * Missing keys fall through to canonical English (the noun's own
     * key) so a hotel Blade reading `$nouns['guest']` gets 'guest'
     * verbatim when the map is empty.
     *
     * @param  array<string,string>  $rawNouns
     * @return array<string,string>
     */
    private function expandNouns(array $rawNouns): array
    {
        $defaults = [
            'guest'       => 'guest',
            'guests'      => 'guests',
            'concierge'   => 'concierge',
            'room'        => 'room',
            'rooms'       => 'rooms',
            'stay'        => 'stay',
            'stays'       => 'stays',
            'check-in'    => 'check-in',
            'check-out'   => 'check-out',
            'reservation' => 'reservation',
            'property'    => 'property',
            'hotel'       => 'hotel',
            // Semantic aliases — Blades use these where the English
            // identity isn't a great variable name (`$nouns['end_user']`
            // reads better than `$nouns['guest']`).
            'end_user'      => 'guest',
            'resource'      => 'room',
            'time_unit'     => 'stay',
            'booking_event' => 'reservation',
            'workspace'     => 'hotel',
        ];

        // Apply raw industry swaps over the defaults. For semantic
        // aliases, derive from the canonical key's swap (so
        // `$nouns['end_user']` returns 'client' for beauty even
        // though the profile's nouns map keys on 'guest').
        $semanticToCanonical = [
            'end_user'      => 'guest',
            'resource'      => 'room',
            'time_unit'     => 'stay',
            'booking_event' => 'reservation',
            'workspace'     => 'hotel',
        ];

        $expanded = $defaults;
        foreach ($rawNouns as $canonical => $industryNoun) {
            $expanded[$canonical] = $industryNoun;
            // Auto-plural for the matching plural key when present
            // in defaults (no need to redeclare 'guests' in every
            // profile if 'guest' is set).
            $pluralKey = $canonical . 's';
            if (isset($defaults[$pluralKey])) {
                $expanded[$pluralKey] = $industryNoun . 's';
            }
        }

        // Map semantic aliases AFTER raw swaps so they pick up the
        // industry-flexed value.
        foreach ($semanticToCanonical as $semantic => $canonical) {
            if (isset($expanded[$canonical])) {
                $expanded[$semantic] = $expanded[$canonical];
            }
        }

        return $expanded;
    }
}
