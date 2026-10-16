<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentTemplateSuggester;
use PHPUnit\Framework\TestCase;

/** The AI's template suggestions, cleaned (spec 2026-10-16 §5.2). */
class TemplateSuggesterCleanTest extends TestCase
{
    public function test_the_answer_keeps_five_named_templates_with_text_and_cleans_each_field(): void
    {
        $data = ['templates' => [
            ['name' => '  Seasonal offer  ', 'platform' => 'Instagram', 'pillar_name' => 'education', 'topic' => 'Offer', 'hook' => 'Book your [treatment] before [date]', 'main_copy' => str_repeat('m', 5100), 'cta' => 'Book now', 'hashtags' => ['autumn', '#Autumn', '#copper hair', '']],
            ['name' => '', 'hook' => 'No name'],
            ['name' => 'No text', 'cta' => 'Only a call to action'],
            ['name' => 'Unknown platform', 'platform' => 'myspace', 'pillar_name' => 'Gossip', 'main_copy' => 'Text'],
            'not a template',
            ['name' => 'Four', 'hook' => 'h'], ['name' => 'Five', 'hook' => 'h'], ['name' => 'Six', 'hook' => 'h'], ['name' => 'Seven', 'hook' => 'h'],
        ]];

        $clean = ContentTemplateSuggester::clean($data, ['Education', 'Behind the scenes']);

        $this->assertSame(['Seasonal offer', 'Unknown platform', 'Four', 'Five', 'Six'], array_column($clean, 'name'));
        $this->assertSame('instagram', $clean[0]['platform']);
        $this->assertSame('Education', $clean[0]['pillar_name']);
        $this->assertSame(5000, mb_strlen($clean[0]['main_copy']));
        $this->assertSame(['#autumn', '#copperhair'], $clean[0]['hashtags']);
        $this->assertNull($clean[1]['platform']);
        $this->assertNull($clean[1]['pillar_name']);
        $this->assertNull($clean[1]['hook']);
        $this->assertSame([], $clean[2]['hashtags']);
        $this->assertSame([], ContentTemplateSuggester::clean(['nothing' => true], []));
    }
}
