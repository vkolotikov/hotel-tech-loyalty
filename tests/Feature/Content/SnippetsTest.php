<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerSnippet;
use App\Services\Content\ContentSnippetSuggester;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Hashtag groups and snippets (spec 2026-10-15 §6): everyone reads them, managers keep them. */
class SnippetsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_keeps_hashtag_groups_and_snippets_and_everyone_reads_them(): void
    {
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'Sign-off', 'body' => 'See you at the studio!'])->assertCreated();
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'hashtags', 'name' => 'Autumn colour', 'body' => '#autumnhair #copperhair'])
            ->assertCreated()->assertJsonPath('snippet.kind', 'hashtags')->assertJsonPath('snippet.name', 'Autumn colour');

        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()
            ->assertJsonCount(2, 'snippets')->assertJsonPath('snippets.0.kind', 'hashtags')->assertJsonPath('snippets.1.body', 'See you at the studio!');
    }

    public function test_staff_may_not_change_them(): void
    {
        $this->asStaffMember()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'x', 'body' => 'y'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_a_snippet_is_edited_and_removed_and_another_brands_does_not_exist_here(): void
    {
        $id = $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'Sign-off', 'body' => 'See you!'])->json('snippet.id');
        $this->asManager()->putJson($this->api("brand/snippets/{$id}"), ['body' => 'See you soon!'])->assertOk()->assertJsonPath('snippet.body', 'See you soon!');
        $this->asManager()->putJson($this->api("brand/snippets/{$id}"), ['kind' => 'hashtags'])->assertStatus(422)->assertJsonValidationErrors('kind');

        [$second] = $this->secondBrand();
        $theirs = $this->asManager()->postJson($this->api("brand/snippets?brand_id={$second}"), ['kind' => 'text', 'name' => 'Theirs', 'body' => 'Theirs'])->json('snippet.id');
        $this->asManager()->putJson($this->api("brand/snippets/{$theirs}"), ['body' => 'Mine now'])->assertNotFound();
        $this->asManager()->deleteJson($this->api("brand/snippets/{$theirs}"))->assertNotFound();

        $this->asManager()->deleteJson($this->api("brand/snippets/{$id}"))->assertOk()->assertJsonCount(0, 'snippets');
    }

    public function test_kinds_names_bodies_and_the_fifty_of_a_kind_are_checked(): void
    {
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'emoji', 'name' => 'x', 'body' => 'y'])->assertStatus(422)->assertJsonValidationErrors('kind');
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => str_repeat('n', 61), 'body' => 'y'])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'x', 'body' => str_repeat('b', 2001)])->assertStatus(422)->assertJsonValidationErrors('body');
        for ($i = 0; $i < 50; $i++) {
            ContentPlannerSnippet::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'kind' => 'hashtags', 'name' => "Group {$i}", 'body' => '#a']);
        }
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'hashtags', 'name' => 'One more', 'body' => '#b'])
            ->assertStatus(422)->assertJsonPath('error', 'too_many_snippets');
        $this->asManager()->postJson($this->api('brand/snippets'), ['kind' => 'text', 'name' => 'Still fine', 'body' => 'ok'])->assertCreated();
    }

    public function test_a_brand_without_a_profile_keeps_no_snippets(): void
    {
        [$second] = $this->secondBrand(false);
        $this->asManager()->postJson($this->api("brand/snippets?brand_id={$second}"), ['kind' => 'text', 'name' => 'x', 'body' => 'y'])
            ->assertStatus(409)->assertJsonPath('error', 'no_profile');
        $this->asManager()->getJson($this->api("brand?brand_id={$second}"))->assertOk()->assertJsonPath('snippets', []);
    }

    public function test_a_manager_gets_hashtag_group_suggestions_and_nothing_is_saved(): void
    {
        $suggester = Mockery::mock(ContentSnippetSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andReturn([['name' => 'Autumn colour', 'body' => '#autumnhair #copperhair']]);
        $this->app->instance(ContentSnippetSuggester::class, $suggester);

        $this->asManager()->postJson($this->api('brand/snippets/suggest'))->assertOk()->assertJsonPath('suggestions.0.name', 'Autumn colour');
        $this->assertSame(0, ContentPlannerSnippet::count());
    }

    public function test_suggestions_are_for_managers_fail_in_our_words_and_wait_at_the_budget_cap(): void
    {
        $suggester = Mockery::mock(ContentSnippetSuggester::class);
        $suggester->shouldReceive('suggest')->once()->andThrow(new \RuntimeException('Private provider detail'));
        $this->app->instance(ContentSnippetSuggester::class, $suggester);

        $this->asStaffMember()->postJson($this->api('brand/snippets/suggest'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asManager()->postJson($this->api('brand/snippets/suggest'))->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('Private provider detail');
        $this->setAiCap(100, 120);
        $this->asManager()->postJson($this->api('brand/snippets/suggest'))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }
}
