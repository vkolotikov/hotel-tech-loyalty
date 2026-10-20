<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentPlatformRules;
use App\Services\Content\PromotionWriter;
use PHPUnit\Framework\TestCase;

/** One page's promotion posts: the request and the answer (spec 2026-10-20 §4.4), without the AI. */
class PromotionWriterTest extends TestCase
{
    private const PAGE = ['url' => 'https://lumiere.example/blog/autumn', 'title' => 'Autumn colours', 'description' => 'Three warm tones.', 'published_at' => '2026-09-01', 'text' => 'Copper suits warm skin.'];
    private const SLOTS = [['platform' => 'linkedin', 'date' => '2026-10-06'], ['platform' => 'instagram', 'date' => '2026-10-07'], ['platform' => 'linkedin', 'date' => '2026-10-13']];

    public function test_the_request_names_the_slots_rules_page_language_and_angles(): void
    {
        $prompt = PromotionWriter::prompt(self::PAGE, self::SLOTS, 'de', 'A salon in Riga.', ['Old hook'], 'Mention the offer.');

        $this->assertStringContainsString('Write 3 posts', $prompt);
        $this->assertStringContainsString('"de"', $prompt);
        $this->assertStringContainsString("1. linkedin — 2026-10-06\n2. instagram — 2026-10-07\n3. linkedin — 2026-10-13", $prompt);
        $this->assertSame(1, substr_count($prompt, ContentPlatformRules::for('linkedin')));
        $this->assertStringContainsString(ContentPlatformRules::for('instagram') . ' Links cannot be clicked here', $prompt);
        $this->assertStringContainsString('Do not write the web address', $prompt);
        $this->assertStringContainsString("Address: https://lumiere.example/blog/autumn\nTitle: Autumn colours", $prompt);
        $this->assertStringContainsString('Copper suits warm skin.', $prompt);
        $this->assertStringContainsString("## HOOKS ALREADY USED FOR THIS PAGE (do not repeat them)\n- Old hook", $prompt);
        $this->assertStringContainsString("## EXTRA INSTRUCTIONS FROM THE USER\nMention the offer.", $prompt);
        $this->assertStringContainsString('myth vs fact', $prompt);
        $this->assertStringContainsString('A salon in Riga.', $prompt);
    }

    public function test_without_earlier_hooks_or_instructions_their_sections_are_left_out_and_long_text_is_cut(): void
    {
        $prompt = PromotionWriter::prompt(['text' => str_repeat('x', 9000)] + self::PAGE, self::SLOTS, 'en', '', [], null);

        $this->assertStringNotContainsString('HOOKS ALREADY USED', $prompt);
        $this->assertStringNotContainsString('EXTRA INSTRUCTIONS', $prompt);
        $this->assertStringContainsString(str_repeat('x', PromotionWriter::TEXT_CHARS) . "\n", $prompt);
        $this->assertStringNotContainsString(str_repeat('x', PromotionWriter::TEXT_CHARS + 1), $prompt);
    }

    public function test_each_slot_takes_its_answer_cut_to_the_columns(): void
    {
        $posts = PromotionWriter::posts(['posts' => [
            ['platform' => 'x', 'angle' => 'question', 'topic' => 'T', 'hook' => str_repeat('h', 600), 'main_copy' => ' Copy ', 'cta' => 'Read', 'hashtags' => ['#a', ' ', ['x'], '#b'], 'post_type' => 'how_to', 'visual_idea' => 'V'],
            ['hook' => null, 'main_copy' => ''],
        ]], self::SLOTS);

        $this->assertCount(3, $posts);
        $this->assertSame('linkedin', $posts[0]['platform']);
        $this->assertSame(500, mb_strlen($posts[0]['hook']));
        $this->assertSame('Copy', $posts[0]['main_copy']);
        $this->assertSame(['#a', '#b'], $posts[0]['hashtags']);
        $this->assertSame('how_to', $posts[0]['post_type']);
        $this->assertNull($posts[1]);
        $this->assertNull($posts[2]);
    }

    public function test_a_post_type_outside_the_list_is_dropped_and_a_hook_alone_is_enough(): void
    {
        $posts = PromotionWriter::posts(['posts' => [['hook' => 'Only a hook', 'post_type' => 'meme']]], [self::SLOTS[0]]);

        $this->assertSame('Only a hook', $posts[0]['hook']);
        $this->assertNull($posts[0]['main_copy']);
        $this->assertNull($posts[0]['post_type']);
        $this->assertSame([null], PromotionWriter::posts(['nothing' => true], [self::SLOTS[0]]));
    }
}
