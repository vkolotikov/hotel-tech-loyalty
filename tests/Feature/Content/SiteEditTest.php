<?php

namespace Tests\Feature\Content;

use App\Models\ContentSite;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Reading and editing the website (spec 2026-10-20 §3.1, §6.2). */
class SiteEditTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_without_a_site_everyone_reads_the_suggested_address(): void
    {
        $this->org->forceFill(['website' => 'https://lumiere.example'])->save();

        $this->asStaffMember()->getJson($this->api('site'))->assertOk()
            ->assertJsonPath('site', null)
            ->assertJsonPath('suggested_url', 'https://lumiere.example')
            ->assertJsonPath('pages', []);
    }

    public function test_a_manager_saves_the_address_and_a_bad_one_is_refused(): void
    {
        $this->asManager()->putJson($this->api('site'), ['url' => ' https://lumiere.example/blog '])->assertOk()
            ->assertJsonPath('site.url', 'https://lumiere.example/blog')
            ->assertJsonPath('site.status', 'new');

        $this->asManager()->putJson($this->api('site'), ['url' => 'http://10.0.0.1/'])
            ->assertStatus(422)->assertJsonPath('error', 'bad_address');
    }

    public function test_an_edited_summary_is_marked_and_an_empty_one_clears_it(): void
    {
        $this->asManager()->putJson($this->api('site'), ['summary' => 'Lumière cuts hair.'])->assertOk()
            ->assertJsonPath('site.summary', 'Lumière cuts hair.')
            ->assertJsonPath('site.summary_edited', true);

        $this->asManager()->putJson($this->api('site'), ['summary' => '  '])->assertOk()
            ->assertJsonPath('site.summary', null)
            ->assertJsonPath('site.summary_edited', false);
    }

    /** Final review (re-graded): the portal reads the site every 4 s during a scan; its pages' text (up to 20,000 characters each) stays in the database. */
    public function test_reading_the_site_never_loads_the_pages_text(): void
    {
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready', 'scanned_at' => now()]);
        \App\Models\ContentSitePage::create(['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example/a', 'url_hash' => hash('sha256', 'https://lumiere.example/a'),
            'kind' => 'article', 'title' => 'A', 'body' => str_repeat('text ', 1000), 'last_seen_at' => now()]);
        $queries = [];
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        $this->asStaffMember()->getJson($this->api('site'))->assertOk()->assertJsonPath('pages.0.title', 'A');
        $pageQueries = array_values(array_filter($queries, fn (string $sql) => str_contains($sql, 'from "content_site_pages"')));
        $this->assertNotEmpty($pageQueries);
        foreach ($pageQueries as $sql) {
            $this->assertStringNotContainsString('select *', $sql);
            $this->assertStringNotContainsString('"body"', $sql);
        }
    }

    public function test_staff_cannot_edit_and_nothing_changes_while_a_scan_runs(): void
    {
        $this->asStaffMember()->putJson($this->api('site'), ['url' => 'https://lumiere.example'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');

        ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example',
            'status' => 'scanning', 'scan_token' => 't', 'scan_queued_at' => now()]);
        $this->asManager()->putJson($this->api('site'), ['summary' => 'x'])
            ->assertStatus(409)->assertJsonPath('error', 'scan_running');
    }
}
