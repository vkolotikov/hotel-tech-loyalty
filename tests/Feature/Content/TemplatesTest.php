<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerTemplate;
use App\Services\Content\ContentTemplateSuggester;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Templates (spec 2026-10-16 §5): everyone reads a brand's templates, managers keep them, at most 100. */
class TemplatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    private const TEMPLATE = [
        'name' => 'Book before the date', 'platform' => 'instagram', 'pillar_name' => 'Education', 'topic' => 'A seasonal offer',
        'hook' => 'Book your [treatment] before [date]', 'main_copy' => "Our [treatment] is back.\nBook by [date].", 'cta' => 'Book now', 'hashtags' => ['#autumn'],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_keeps_templates_and_everyone_reads_them(): void
    {
        $this->asManager()->postJson($this->api('brand/templates'), self::TEMPLATE)->assertCreated()
            ->assertJsonPath('template.name', 'Book before the date')
            ->assertJsonPath('template.hook', 'Book your [treatment] before [date]')
            ->assertJsonPath('templates.0.hashtags', ['#autumn']);
        $this->asManager()->postJson($this->api('brand/templates'), ['name' => 'Just a name'])->assertCreated()
            ->assertJsonPath('template.platform', null)
            ->assertJsonPath('template.hashtags', []);

        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()
            ->assertJsonCount(2, 'templates')
            ->assertJsonPath('templates.0.main_copy', "Our [treatment] is back.\nBook by [date].")
            ->assertJsonPath('templates.1.name', 'Just a name');
    }

    public function test_staff_may_not_change_them(): void
    {
        $this->asStaffMember()->postJson($this->api('brand/templates'), ['name' => 'x'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_fields_and_the_hundred_are_checked(): void
    {
        $bad = fn (array $fields, string $error) => $this->asManager()->postJson($this->api('brand/templates'), $fields + ['name' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors($error);
        $bad(['name' => str_repeat('n', 81)], 'name');
        $bad(['platform' => 'myspace'], 'platform');
        $bad(['hook' => str_repeat('h', 501)], 'hook');
        $bad(['main_copy' => str_repeat('m', 5001)], 'main_copy');
        $bad(['cta' => str_repeat('c', 256)], 'cta');
        $bad(['hashtags' => array_fill(0, 31, '#a')], 'hashtags');
        $this->asManager()->postJson($this->api('brand/templates'), ['hook' => 'No name'])->assertStatus(422)->assertJsonValidationErrors('name');

        for ($i = 0; $i < 100; $i++) {
            ContentPlannerTemplate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => "Template {$i}"]);
        }
        $this->asManager()->postJson($this->api('brand/templates'), ['name' => 'One more'])->assertStatus(422)->assertJsonPath('error', 'too_many_templates');
    }

    public function test_a_template_is_edited_and_removed_and_another_brands_does_not_exist_here(): void
    {
        $id = $this->asManager()->postJson($this->api('brand/templates'), self::TEMPLATE)->json('template.id');
        $this->asManager()->putJson($this->api("brand/templates/{$id}"), ['cta' => 'Call us', 'platform' => null])->assertOk()
            ->assertJsonPath('template.cta', 'Call us')
            ->assertJsonPath('template.platform', null)
            ->assertJsonPath('template.name', 'Book before the date');

        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("brand/templates?brand_id={$second}"), ['name' => 'Theirs'])->assertCreated()->json('template.id');
        $this->asManager()->putJson($this->api("brand/templates/{$theirs}"), ['name' => 'Mine now'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("brand/templates/{$theirs}"))->assertNotFound();

        $this->asManager()->deleteJson($this->api("brand/templates/{$id}"))->assertOk()->assertJsonCount(0, 'templates');
    }

    public function test_a_brand_without_a_profile_keeps_no_templates(): void
    {
        [$second] = $this->secondBrand(false);
        $this->asManager()->postJson($this->api("brand/templates?brand_id={$second}"), ['name' => 'x'])->assertStatus(409)->assertJsonPath('error', 'no_profile');
        $this->asManager()->getJson($this->api("brand?brand_id={$second}"))->assertOk()->assertJsonPath('templates', []);
    }

    public function test_a_manager_gets_template_suggestions_and_nothing_is_saved(): void
    {
        $suggester = Mockery::mock(ContentTemplateSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andReturn([[
            'name' => 'Seasonal offer', 'platform' => 'instagram', 'pillar_name' => null, 'topic' => null,
            'hook' => 'Book your [treatment] before [date]', 'main_copy' => null, 'cta' => null, 'hashtags' => [],
        ]]);
        $this->app->instance(ContentTemplateSuggester::class, $suggester);

        $this->asManager()->postJson($this->api('brand/templates/suggest'))->assertOk()
            ->assertJsonPath('suggestions.0.name', 'Seasonal offer')
            ->assertJsonPath('suggestions.0.hook', 'Book your [treatment] before [date]');
        $this->assertSame(0, ContentPlannerTemplate::count());
    }

    public function test_suggestions_are_for_managers_fail_in_our_words_and_wait_at_the_budget_cap(): void
    {
        $suggester = Mockery::mock(ContentTemplateSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andThrow(new \RuntimeException('Private provider detail'));
        $this->app->instance(ContentTemplateSuggester::class, $suggester);

        $this->asStaffMember()->postJson($this->api('brand/templates/suggest'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asManager()->postJson($this->api('brand/templates/suggest'))->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('Private provider detail');
        $this->setAiCap(100, 120);
        $this->asManager()->postJson($this->api('brand/templates/suggest'))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }
}
