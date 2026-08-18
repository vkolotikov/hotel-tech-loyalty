<?php

namespace Tests\Unit\Chatbot;

use App\Models\Organization;
use App\Services\Chatbot\ChatbotPresetService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Locks the per-industry chatbot starter packs.
 *
 * Two classes of contract are worth a test here.
 *
 * The first is that the packs actually differ per industry. The bug these
 * presets exist to fix is that ChatbotBehaviorConfig::getForOrg() named every
 * assistant "Hotel Assistant" and no industry had a greeting, suggestion chips,
 * an escalation policy or a fallback message. A preset that quietly reverted to
 * hotel wording for a clinic would reintroduce exactly that, so the tests assert
 * the absence of hotel framing rather than trusting it.
 *
 * The second is renderFaq's drop rule. These entries are published to a PUBLIC
 * assistant embedded on the venue's own website. An assistant that answers "our
 * address is {{address}}" is worse than one that offers to check — it is
 * visibly broken to that venue's customers. So the placeholder-leak test is the
 * load-bearing one: it must be impossible to reach a published answer that
 * still contains a token.
 */
class ChatbotPresetServiceTest extends TestCase
{
    private ChatbotPresetService $presets;

    protected function setUp(): void
    {
        parent::setUp();
        $this->presets = new ChatbotPresetService();
    }

    public static function industries(): array
    {
        return array_map(fn ($i) => [$i], Organization::INDUSTRIES);
    }

    #[DataProvider('industries')]
    public function test_every_industry_has_a_complete_pack(string $industry): void
    {
        $preset = $this->presets->for($industry);

        $this->assertSame($industry, $preset->industry);

        // Each of these was empty or hotel-hardcoded before presets existed.
        $this->assertNotSame('', trim($preset->assistantName));
        $this->assertNotSame('', trim($preset->goal));
        $this->assertNotSame('', trim($preset->escalationPolicy));
        $this->assertNotSame('', trim($preset->fallbackMessage));
        $this->assertNotSame('', trim($preset->welcomeTitle));
        $this->assertNotSame('', trim($preset->welcomeSubtitle));

        $this->assertCount(3, $preset->suggestions,
            'The widget shows three starter chips; supplying a different number means some other industry silently gets the hard-coded hotel defaults.');
        $this->assertNotEmpty($preset->coreRules);
        $this->assertNotEmpty($preset->starterFaq);
    }

    #[DataProvider('industries')]
    public function test_no_industry_ships_hotel_framing(string $industry): void
    {
        $preset = $this->presets->for($industry);

        if ($industry === 'hotel') {
            $this->assertTrue(true, 'Hotel is allowed to sound like a hotel.');
            return;
        }

        $surface = strtolower(implode(' ', [
            $preset->assistantName,
            $preset->goal,
            $preset->welcomeTitle,
            $preset->welcomeSubtitle,
            implode(' ', $preset->suggestions),
        ]));

        foreach (['hotel', 'guest room', 'your stay', 'check-in'] as $hotelism) {
            $this->assertStringNotContainsString($hotelism, $surface,
                "A {$industry} venue must never be handed hotel wording — that is the defect these presets exist to fix.");
        }
    }

    public function test_unknown_and_null_industries_fall_back_to_hotel(): void
    {
        // Matches IndustryPromptService::for() so the two services never
        // disagree about what an unrecognised industry is.
        $this->assertSame('hotel', $this->presets->for(null)->industry);
        $this->assertSame('hotel', $this->presets->for('not_a_real_industry')->industry);
    }

    /* ─── renderFaq ─────────────────────────────────────────────────────── */

    public function test_entries_whose_facts_are_missing_are_dropped(): void
    {
        $preset = $this->presets->for('fitness');

        // Only hours supplied — every other entry must be withheld.
        $rendered = $this->presets->renderFaq($preset, ['hours' => 'Mon–Fri 6:00–22:00']);

        $this->assertCount(1, $rendered);
        $this->assertSame('What are your opening hours?', $rendered[0]['question']);
        $this->assertStringContainsString('Mon–Fri 6:00–22:00', $rendered[0]['answer']);
    }

    #[DataProvider('industries')]
    public function test_no_rendered_answer_can_contain_an_unfilled_placeholder(string $industry): void
    {
        $preset = $this->presets->for($industry);

        // Supply every fact this industry knows about EXCEPT one, then rotate
        // which one is withheld. No combination may leak a token.
        $allKeys = array_keys($this->presets->factsFor($industry));

        foreach ($allKeys as $withheld) {
            $facts = [];
            foreach ($allKeys as $key) {
                if ($key !== $withheld) {
                    $facts[$key] = "value for {$key}";
                }
            }

            foreach ($this->presets->renderFaq($preset, $facts) as $entry) {
                $this->assertStringNotContainsString('{{', $entry['answer'],
                    "Withholding '{$withheld}' leaked a placeholder into a published answer for {$industry}.");
            }
        }

        // And the degenerate case: no facts at all yields nothing to publish.
        $this->assertSame([], $this->presets->renderFaq($preset, []));
    }

    public function test_blank_and_whitespace_facts_count_as_missing(): void
    {
        $preset = $this->presets->for('other');

        // A wizard field the user tabbed through must not publish an empty
        // answer — "We are at ." is worse than saying nothing.
        $rendered = $this->presets->renderFaq($preset, [
            'hours'   => '   ',
            'address' => '',
            'phone'   => null,
        ]);

        $this->assertSame([], $rendered);
    }

    #[DataProvider('industries')]
    public function test_every_template_declares_the_facts_it_interpolates(string $industry): void
    {
        // Guards the pairing that renderFaq's drop rule depends on: a template
        // that interpolates {{x}} without declaring 'x' in `needs` would be
        // published with a live placeholder the moment the other facts are set.
        $preset = $this->presets->for($industry);

        foreach ($preset->starterFaq as $entry) {
            preg_match_all('/\{\{(\w+)\}\}/', $entry['answer'], $m);

            foreach (array_unique($m[1]) as $token) {
                $this->assertContains($token, $entry['needs'],
                    "Template \"{$entry['question']}\" interpolates {{{$token}}} but does not declare it in needs.");
            }

            $this->assertNotEmpty($entry['keywords'],
                'Knowledge lookup is keyword-driven; an entry with no keywords is unreachable.');
        }
    }

    public function test_facts_include_industry_specific_extras(): void
    {
        $this->assertArrayHasKey('check_in', $this->presets->factsFor('hotel'));
        $this->assertArrayHasKey('menu_url', $this->presets->factsFor('restaurant'));
        $this->assertArrayHasKey('trial', $this->presets->factsFor('fitness'));

        // Universal facts survive the merge.
        $this->assertArrayHasKey('hours', $this->presets->factsFor('fitness'));

        // 'other' has no extras and must not inherit another industry's.
        $this->assertSame(
            array_keys(ChatbotPresetService::UNIVERSAL_FACTS),
            array_keys($this->presets->factsFor('other')),
        );
    }

    public function test_medical_carries_the_rules_its_industry_requires(): void
    {
        // Medical is the one industry where a wrong answer is dangerous rather
        // than embarrassing, and IndustryPromptService's guardrails only cover
        // the prompt frame — the owner-facing rule list needs them too.
        $rules = strtolower(implode(' ', $this->presets->for('medical')->coreRules));

        $this->assertStringContainsString('never give medical advice', $rules);
        $this->assertStringContainsString('emergency', $rules);
    }
}
