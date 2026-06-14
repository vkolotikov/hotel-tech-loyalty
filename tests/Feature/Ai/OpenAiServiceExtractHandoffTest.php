<?php

namespace Tests\Feature\Ai;

use App\Services\OpenAiService;
use ReflectionMethod;
use ReflectionProperty;
use Tests\TestCase;

/**
 * Locks OpenAiService::extractHandoffToken — the marker-parsing
 * primitive that drives human-handoff escalation from the website
 * chatbot.
 *
 * The chatbot is instructed (via system prompt) to emit a trailing
 * `[HANDOFF:<reason>]` token when it can't help — e.g. "the guest
 * wants to speak to a manager" or "this is a complex booking
 * change". The chat() public method calls this private extractor
 * to:
 *   1. Stash the reason on the public lastHandoff property
 *      (ChatbotController reads this after chat() to flag the
 *      conversation for agent attention)
 *   2. Strip the token from the visible response so the guest
 *      doesn't see "[HANDOFF:...]" in their chat bubble
 *
 * Regression risks:
 *   - Token leaks into the user-visible reply
 *   - Reason parsing breaks (lastHandoff stays null even when
 *     marker present)
 *   - Off-by-one regex anchor: marker in the middle of a reply
 *     gets falsely matched
 *
 * Tests use ReflectionMethod since extractHandoffToken is
 * private. Promoting to public would expand the API surface
 * unnecessarily — chat() is the documented public entry point.
 */
class OpenAiServiceExtractHandoffTest extends TestCase
{
    private OpenAiService $service;
    private ReflectionMethod $extract;
    private ReflectionProperty $lastHandoffProp;

    protected function setUp(): void
    {
        parent::setUp();

        // OpenAiService constructor reads config('openai.model') —
        // safe to instantiate without a real API key since these
        // tests only exercise the private string-parsing method.
        $this->service = new OpenAiService();

        $this->extract = new ReflectionMethod($this->service, 'extractHandoffToken');
        $this->extract->setAccessible(true);

        $this->lastHandoffProp = new ReflectionProperty($this->service, 'lastHandoff');
        $this->lastHandoffProp->setAccessible(true);
    }

    private function invoke(string $reply): string
    {
        return $this->extract->invoke($this->service, $reply);
    }

    public function test_reply_without_handoff_marker_passes_through_verbatim(): void
    {
        // The no-op case — most guest replies don't request handoff.
        $reply = 'Sure, let me check that for you.';

        $out = $this->invoke($reply);

        $this->assertSame($reply, $out);
        $this->assertNull($this->service->lastHandoff,
            'No marker → lastHandoff must stay null.');
    }

    public function test_bare_handoff_marker_sets_default_reason(): void
    {
        // `[HANDOFF]` (no reason colon) signals a generic handoff
        // request — fallback reason is "requested".
        $reply = "I'll get someone to help you.\n[HANDOFF]";

        $out = $this->invoke($reply);

        $this->assertSame('requested', $this->service->lastHandoff,
            'Bare marker must yield default reason "requested".');
        // Marker stripped from visible text.
        $this->assertStringNotContainsString('[HANDOFF', $out);
        $this->assertSame("I'll get someone to help you.", $out);
    }

    public function test_handoff_marker_with_reason_captures_lowercased_reason(): void
    {
        // The canonical structured handoff. Reason gets
        // lowercased + trimmed to feed downstream classifier.
        $reply = "Let me connect you with a human.\n[HANDOFF:complex_booking]";

        $out = $this->invoke($reply);

        $this->assertSame('complex_booking', $this->service->lastHandoff);
        $this->assertSame('Let me connect you with a human.', $out);
    }

    public function test_handoff_reason_is_lowercased(): void
    {
        // Defensive: model output may use Mixed-Case for the
        // reason. Downstream classification expects lowercase.
        $reply = "[HANDOFF:COMPLAINT]";

        $this->invoke($reply);

        $this->assertSame('complaint', $this->service->lastHandoff,
            'Reason must be lowercased.');
    }

    public function test_handoff_marker_at_end_with_trailing_whitespace_is_matched(): void
    {
        // The regex allows trailing whitespace after the marker
        // (LLMs sometimes append a newline or space).
        $reply = "Connecting you now.\n[HANDOFF:manager]   \n";

        $out = $this->invoke($reply);

        $this->assertSame('manager', $this->service->lastHandoff);
        $this->assertSame('Connecting you now.', $out);
    }

    public function test_handoff_marker_in_middle_of_reply_is_NOT_matched(): void
    {
        // The regex is anchored with `\s*$` — it must ONLY match
        // when the marker is at the END of the reply (with
        // optional trailing whitespace). A marker IN THE MIDDLE
        // of natural language must not falsely trigger handoff.
        $reply = 'I sometimes use [HANDOFF:demo] as an example. Here is the answer.';

        $out = $this->invoke($reply);

        $this->assertSame($reply, $out,
            'Marker in the middle must be left verbatim.');
        $this->assertNull($this->service->lastHandoff,
            'Marker in the middle must NOT trigger handoff.');
    }

    public function test_reason_with_hyphens_and_underscores_is_captured(): void
    {
        // The reason regex accepts [a-z0-9_\- ] — hyphens and
        // underscores are common in classifier labels.
        $reply = '[HANDOFF:booking-change-request]';

        $this->invoke($reply);

        $this->assertSame('booking-change-request', $this->service->lastHandoff);
    }

    public function test_oversized_reason_80_chars_plus_does_not_match(): void
    {
        // The regex caps reason at 80 chars (defensive against
        // model hallucinating a giant reason string). An oversized
        // reason fails the match entirely — handoff doesn't fire.
        $longReason = str_repeat('a', 81);
        $reply = "[HANDOFF:{$longReason}]";

        $out = $this->invoke($reply);

        $this->assertSame($reply, $out,
            'Oversized reason must NOT match — full reply passes through.');
        $this->assertNull($this->service->lastHandoff);
    }
}
