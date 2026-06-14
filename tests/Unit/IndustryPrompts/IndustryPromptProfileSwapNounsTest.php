<?php

namespace Tests\Unit\IndustryPrompts;

use App\Services\IndustryPrompts\IndustryPromptProfile;
use PHPUnit\Framework\TestCase;

/**
 * Locks IndustryPromptProfile::swapNouns — the case-aware +
 * plural-aware noun swap (Phase 7 industry vocabulary, with the
 * reviewer-flagged plural fix).
 *
 * Why this matters:
 *
 *   Every AI prompt builder routes its hotel-flavoured text
 *   through swapNouns() to surface industry-correct vocabulary
 *   ("guest" → "client" for beauty, "guest" → "patient" for
 *   medical). A regression here means the chatbot speaks the
 *   wrong vocabulary to the wrong customer base.
 *
 * Phase 7 reviewer-flagged bug (documented in source):
 *
 *   The prior `\b{from}\b` regex did NOT match 'guests' because
 *   the boundary between 't' and 's' is between two WORD chars
 *   (both alphanumeric) — `\b` only matches word↔non-word
 *   transitions. So `\bguest\b` against 'guests' missed entirely.
 *
 * Fix contract:
 *
 *   - Match optional trailing suffix (es | 's | s), preserve on
 *     replacement
 *   - Replacement values in the profile MUST be SINGULAR — the
 *     pluralisation is automatic
 *   - Hotel's empty nounMap → no-op (verbatim back-compat with
 *     pre-Phase-7 prompts)
 *   - Case preservation: 'guest' → 'client', 'Guest' → 'Client',
 *     'GUEST' → 'CLIENT'
 *   - Plural preservation: 'guests' → 'clients', 'Guests' →
 *     'Clients', "guest's" → "client's"
 *
 * Pure-function test — no DB / no boot.
 */
class IndustryPromptProfileSwapNounsTest extends TestCase
{
    /** Build a profile with a guest→client noun map. */
    private function beautyProfile(array $extraNouns = []): IndustryPromptProfile
    {
        return new IndustryPromptProfile(
            industry: 'beauty',
            persona: 'salon coordinator',
            nouns: array_merge(['guest' => 'client', 'stay' => 'visit', 'room' => 'treatment room'], $extraNouns),
            guardrails: '',
            workspaceLabel: 'salon',
        );
    }

    /* ─── Empty noun map: verbatim pass-through (hotel back-compat) ─── */

    public function test_hotel_empty_noun_map_is_a_no_op(): void
    {
        // CRITICAL back-compat: hotel profile's empty noun map
        // MUST leave existing prompts unchanged. Without this,
        // every hotel customer would see vocabulary drift on
        // deploy.
        $hotel = new IndustryPromptProfile(
            industry: 'hotel',
            persona: 'concierge',
            nouns: [],
            guardrails: '',
            workspaceLabel: 'hotel',
        );

        $text = 'Welcome the guest to the room, ensure their stay is comfortable.';

        $this->assertSame($text, $hotel->swapNouns($text),
            'Empty noun map MUST be a verbatim no-op.');
    }

    /* ─── Singular swap with case preservation ─── */

    public function test_lowercase_singular_swap(): void
    {
        $out = $this->beautyProfile()->swapNouns('Greet the guest warmly.');
        $this->assertSame('Greet the client warmly.', $out);
    }

    public function test_titlecase_singular_preserves_first_capital(): void
    {
        // 'Guest' (titlecase) → 'Client' — capitalize first letter
        // of the replacement to match the input.
        $out = $this->beautyProfile()->swapNouns('Guest preferences matter.');
        $this->assertSame('Client preferences matter.', $out);
    }

    public function test_uppercase_singular_preserves_full_uppercase(): void
    {
        // 'GUEST' → 'CLIENT' — full uppercase preserved.
        $out = $this->beautyProfile()->swapNouns('IMPORTANT: GUEST ALLERGY.');
        $this->assertSame('IMPORTANT: CLIENT ALLERGY.', $out);
    }

    /* ─── THE plural-fix — Phase 7 reviewer-flagged regression ─── */

    public function test_lowercase_plural_with_s_swaps_and_preserves_plural(): void
    {
        // THE bug the Phase 7 reviewer caught. Pre-fix this said
        // "Greet the guests" (no swap). Post-fix: "Greet the
        // clients". The whole noun map was a near-no-op without
        // this — hotel-flavoured prompts use plurals constantly.
        $out = $this->beautyProfile()->swapNouns('Greet the guests warmly.');
        $this->assertSame('Greet the clients warmly.', $out,
            'CRITICAL: plural "guests" MUST swap to "clients" (Phase 7 fix).');
    }

    public function test_titlecase_plural_preserves_first_capital(): void
    {
        $out = $this->beautyProfile()->swapNouns('Guests deserve attention.');
        $this->assertSame('Clients deserve attention.', $out);
    }

    public function test_genitive_apostrophe_s_swaps_and_preserves(): void
    {
        // The third documented affix: "guest's room" → "client's
        // treatment room".
        $out = $this->beautyProfile()->swapNouns("the guest's name");
        $this->assertSame("the client's name", $out);
    }

    public function test_es_suffix_alternation_wins_over_s(): void
    {
        // The alternation order in the regex ('es' before 's')
        // means a word ending in '-es' (like 'witnesses') is
        // matched as root + 'es', NOT as root+'e' + 's'. The
        // contract preserves the matched suffix literally — so a
        // map value that itself doesn't take 'es' would produce
        // a grammatically odd output. Production maps avoid this
        // by using values whose pluralisation matches the source.
        //
        // This test locks the literal suffix-preservation
        // behavior on a value chosen so the 'es' append makes
        // sense: 'witness' → 'guess' (both take 'es').
        $profile = $this->beautyProfile(['witness' => 'guess']);

        $out = $profile->swapNouns('Two witnesses signed.');
        $this->assertSame('Two guesses signed.', $out,
            "'es' suffix MUST be preserved literally on the replacement.");
    }

    /* ─── Replacement uses SINGULAR form per docstring ─── */

    public function test_replacement_values_must_be_singular_pluralisation_is_automatic(): void
    {
        // The docstring requires replacement values to be singular.
        // Verify the swap auto-appends the matched plural suffix
        // rather than the map's value being already-pluralised.
        $profile = $this->beautyProfile();

        // Input has plural 'guests'; map has singular 'client'.
        // Output MUST be 'clients' — automatic pluralisation.
        $this->assertSame('clients',
            trim($profile->swapNouns('guests')),
            'Singular map value MUST get auto-pluralised based on the matched suffix.');
    }

    /* ─── Word boundary behaviour: do NOT match substrings ─── */

    public function test_does_not_match_partial_word_substring(): void
    {
        // 'guest' is a substring of 'guestbook' / 'guesting' /
        // 'guesthouse'. The \b boundary MUST prevent these from
        // being mangled to 'clientbook' / 'clienting'.
        $profile = $this->beautyProfile();

        $out = $profile->swapNouns('Guestbook entries are private.');
        $this->assertSame('Guestbook entries are private.', $out,
            'Substring "guest" inside "Guestbook" MUST NOT trigger a swap.');
    }

    public function test_does_not_match_inside_other_compound_word(): void
    {
        $profile = $this->beautyProfile();

        $out = $profile->swapNouns('The guesthouse is full.');
        $this->assertSame('The guesthouse is full.', $out,
            'Compound word "guesthouse" MUST stay intact.');
    }

    /* ─── Multi-noun maps + multiple occurrences in one string ─── */

    public function test_multi_noun_map_applies_all_swaps(): void
    {
        $profile = $this->beautyProfile();

        $out = $profile->swapNouns(
            'The guest checks the room before the stay begins.',
        );

        $this->assertSame(
            'The client checks the treatment room before the visit begins.',
            $out,
            'All 3 nouns in the map MUST swap in one pass.',
        );
    }

    public function test_multiple_occurrences_of_same_noun_all_swap(): void
    {
        $profile = $this->beautyProfile();

        $out = $profile->swapNouns(
            'Welcome the guest, ensure the guest is comfortable, ask the guest if they need anything.',
        );

        $this->assertSame(
            'Welcome the client, ensure the client is comfortable, ask the client if they need anything.',
            $out,
        );
    }

    public function test_singular_and_plural_swap_in_the_same_sentence(): void
    {
        $profile = $this->beautyProfile();

        $out = $profile->swapNouns(
            'Each guest matters; greet all guests by name.',
        );

        $this->assertSame(
            'Each client matters; greet all clients by name.',
            $out,
        );
    }

    /* ─── Whole-word edge cases ─── */

    public function test_swap_at_start_of_string(): void
    {
        $out = $this->beautyProfile()->swapNouns('Guests gathered.');
        $this->assertSame('Clients gathered.', $out);
    }

    public function test_swap_at_end_of_string(): void
    {
        $out = $this->beautyProfile()->swapNouns('Welcome the guest');
        $this->assertSame('Welcome the client', $out);
    }

    public function test_empty_input_returns_empty(): void
    {
        $this->assertSame('', $this->beautyProfile()->swapNouns(''));
    }

    public function test_input_with_no_mapped_nouns_passes_through_unchanged(): void
    {
        // Text that doesn't mention any mapped noun MUST be
        // returned verbatim. Defensive — guards against an empty
        // string bug or regex catastrophic backtracking.
        $text = 'The fish swims in the pond, contemplating life.';
        $this->assertSame($text, $this->beautyProfile()->swapNouns($text));
    }
}
