<?php

namespace Tests\Feature\Content;

use App\Services\AiUsageService;
use App\Services\ContentCalendarGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class AiLedgerTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_content_ai_call_counts_in_the_shared_ledger_with_its_tokens(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        $this->actingAs($this->manager);

        app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-10-05', '2026-10-05', ['platforms' => ['instagram']]);

        $row = DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->first();
        $this->assertNotNull($row, 'no ai_usage_logs row');
        $this->assertSame('content', $row->feature);
        $this->assertSame('claude-sonnet-5', $row->model);
        $this->assertSame([20, 30], [(int) $row->input_tokens, (int) $row->output_tokens]);
        $this->assertSame(1, (int) $row->cost_cents); // (20 × $3 + 30 × $15) per million tokens, rounded up to a cent
    }

    public function test_an_image_is_recorded_at_its_published_price(): void
    {
        $usage = app(AiUsageService::class);
        $usage->recordImage($this->org->id, 'gpt-image-1', '1024x1536', 'content');
        $usage->recordImage($this->org->id, 'dall-e-3', '1024x1024', 'content');
        $usage->recordImage($this->org->id, 'gpt-image-1', '640x640', 'content');   // an unknown size costs the model's largest
        $usage->recordImage($this->org->id, 'some-new-model', '1024x1024', 'content'); // an unknown model is logged at 0

        $rows = DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->orderBy('id')->get();
        $this->assertSame([25, 8, 25, 0], $rows->pluck('cost_cents')->map(fn ($c) => (int) $c)->all());
        $this->assertSame(['image'], $rows->pluck('kind')->unique()->values()->all());
        $this->assertSame(['content'], $rows->pluck('feature')->unique()->values()->all());
    }

    public function test_the_image_service_records_every_image_it_makes(): void
    {
        // The image call goes through its own HTTP client: the wiring is read from the source.
        $source = file_get_contents(app_path('Services/ContentPlanner/ImageGenerationService.php'));
        $this->assertStringContainsString('->recordImage(', $source);
        $this->assertStringContainsString('AiClient::USAGE_FEATURE', $source);
    }
}
