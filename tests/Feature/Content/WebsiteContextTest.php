<?php

namespace Tests\Feature\Content;

use App\Models\ContentSite;
use App\Services\ContentKnowledgeService;
use App\Services\ContentPlanner\ContextBuilder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Every Content AI call reads what the website says (spec 2026-10-20 §3.6). */
class WebsiteContextTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function siteRow(array $attributes): ContentSite
    {
        return ContentSite::create($attributes + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example']);
    }

    public function test_the_context_carries_the_website_summary_with_its_date(): void
    {
        $this->siteRow(['summary' => 'Lumière cuts and colours hair in Riga.', 'summary_updated_at' => '2026-10-04 10:00:00']);

        $this->assertStringContainsString("## FROM THE BRAND'S WEBSITE (scanned 2026-10-04)\nLumière cuts and colours hair in Riga.", app(ContextBuilder::class)->build($this->profile));
    }

    public function test_no_summary_no_section(): void
    {
        $this->siteRow([]);

        $this->assertStringNotContainsString("FROM THE BRAND'S WEBSITE", app(ContextBuilder::class)->build($this->profile));
    }

    public function test_the_readiness_counts_the_sites_address_as_the_company_website(): void
    {
        // The real knowledge service also reads the chat widget's settings; the content schema has no table for them.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->boolean('is_active')->default(true);
                $t->string('company_name')->nullable();
                $t->text('welcome_message')->nullable();
                $t->string('header_title')->nullable();
                $t->text('suggestions')->nullable();
                $t->text('canned_responses')->nullable();
                $t->timestamps();
            });
        }
        $this->siteRow([]);
        $knowledge = new ContentKnowledgeService();

        $this->assertSame('https://lumiere.example', $knowledge->buildForBrand($this->org->id, $this->brandId)['organization']['website']);
        $company = collect($knowledge->readinessOf($this->profile)['sections'])->firstWhere('key', 'company');
        $this->assertNotContains('company_website', $company['missing']);
    }
}
