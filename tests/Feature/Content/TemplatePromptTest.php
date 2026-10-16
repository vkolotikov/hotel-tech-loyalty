<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerTemplate;
use App\Services\ContentPostGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What the AI is told when it writes from a template (spec 2026-10-16 §5.3). */
class TemplatePromptTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function prompt(?ContentPlannerTemplate $template): string
    {
        $service = app(ContentPostGenerationService::class);

        return (new \ReflectionMethod($service, 'buildPostPrompt'))->invoke($service, $this->makePost(), $this->profile, null, $template);
    }

    public function test_write_from_a_template_tells_the_ai_its_shape_and_to_fill_its_blanks(): void
    {
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Seasonal offer',
            'hook' => 'Book your [treatment] before [date]', 'main_copy' => 'Our [treatment] is back.', 'cta' => 'Book now', 'hashtags' => ['#autumn', '#glow']]);

        $with = $this->prompt($template);
        $this->assertStringContainsString('# TEMPLATE TO FOLLOW', $with);
        $this->assertStringContainsString('Hook: Book your [treatment] before [date]', $with);
        $this->assertStringContainsString('Main text: Our [treatment] is back.', $with);
        $this->assertStringContainsString('Call to action: Book now', $with);
        $this->assertStringContainsString('Hashtags: #autumn #glow', $with);
        $this->assertStringContainsString('replace every [blank]', $with);
        $this->assertStringNotContainsString('TEMPLATE TO FOLLOW', $this->prompt(null));
    }

    // Final review (Plan 4A-1): the portal fills a new post from the template, then asks the AI to write it; the topic
    // kept its [blanks] because the AI was never asked for a topic.
    public function test_write_from_a_template_asks_for_the_topic_only_while_it_holds_blanks(): void
    {
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Seasonal offer', 'hook' => 'Book your [treatment] before [date]']);
        $service = app(ContentPostGenerationService::class);
        $prompt = fn (string $topic) => (new \ReflectionMethod($service, 'buildPostPrompt'))->invoke($service, $this->makePost(['topic' => $topic]), $this->profile, null, $template);

        $this->assertStringContainsString('"topic"', $prompt('Book your [treatment] before [date]'));
        $this->assertStringNotContainsString('"topic"', $prompt('Autumn colours'));
    }

    public function test_the_topic_is_filled_only_from_a_template_write_and_only_where_it_held_blanks(): void
    {
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Seasonal offer', 'hook' => 'Book your [treatment]']);
        $after = fn (?ContentPlannerTemplate $t, ?string $topic, array $data) => ContentPostGenerationService::topicAfterWrite($t, $topic, $data);

        $this->assertSame('Book your colour refresh before Friday', $after($template, 'Book your [treatment] before [date]', ['topic' => '  Book your colour refresh before Friday ']));
        $this->assertSame(255, mb_strlen($after($template, '[treatment]', ['topic' => str_repeat('t', 300)])));
        $this->assertSame('Book your [treatment]', $after(null, 'Book your [treatment]', ['topic' => 'Filled']));
        $this->assertSame('Autumn colours', $after($template, 'Autumn colours', ['topic' => 'Something else']));
        $this->assertSame('Book your [treatment]', $after($template, 'Book your [treatment]', ['topic' => '']));
        $this->assertSame('Book your [treatment]', $after($template, 'Book your [treatment]', []));
        $this->assertNull($after($template, null, ['topic' => 'Filled']));
    }

    public function test_a_template_with_only_a_name_adds_nothing(): void
    {
        $template = ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Empty']);

        $this->assertStringNotContainsString('TEMPLATE TO FOLLOW', $this->prompt($template));
    }
}
