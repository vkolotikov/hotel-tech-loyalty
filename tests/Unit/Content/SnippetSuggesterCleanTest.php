<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentSnippetSuggester;
use PHPUnit\Framework\TestCase;

/** What the AI's hashtag groups are cut to before anyone sees them (spec 2026-10-15 §6). */
class SnippetSuggesterCleanTest extends TestCase
{
    public function test_it_keeps_named_groups_of_distinct_one_word_hashtags(): void
    {
        $groups = ContentSnippetSuggester::clean(['groups' => [
            ['name' => 'Autumn colour', 'hashtags' => ['#autumnhair', 'copper hair', '#AutumnHair', '#']],
            ['name' => '', 'hashtags' => ['#x']],
            ['name' => 'Empty', 'hashtags' => []],
            ['name' => str_repeat('n', 70), 'hashtags' => array_map(fn ($i) => "#tag{$i}", range(1, 40))],
        ]]);

        $this->assertCount(2, $groups);
        $this->assertSame(['name' => 'Autumn colour', 'body' => '#autumnhair #copperhair'], $groups[0]);
        $this->assertSame(60, mb_strlen($groups[1]['name']));
        $this->assertCount(30, explode(' ', $groups[1]['body']));
    }

    public function test_it_keeps_at_most_five_groups_and_nothing_from_an_answer_without_groups(): void
    {
        $many = ['groups' => array_map(fn ($i) => ['name' => "Group {$i}", 'hashtags' => ['#a']], range(1, 8))];
        $this->assertCount(5, ContentSnippetSuggester::clean($many));
        $this->assertSame([], ContentSnippetSuggester::clean(['text' => 'no groups']));
    }
}
