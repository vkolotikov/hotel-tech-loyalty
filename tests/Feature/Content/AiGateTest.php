<?php

namespace Tests\Feature\Content;

use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class AiGateTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_an_organisation_without_a_cap_is_never_stopped(): void
    {
        app(ContentAiGate::class)->allow($this->org->fresh());
        $this->addToAssertionCount(1);
    }

    public function test_at_eighty_percent_it_still_runs(): void
    {
        $this->setAiCap(100, 85);
        app(ContentAiGate::class)->allow($this->org->fresh());
        $this->addToAssertionCount(1);
    }

    public function test_at_the_cap_it_refuses(): void
    {
        $this->setAiCap(100, 100);

        try {
            app(ContentAiGate::class)->allow($this->org->fresh());
            $this->fail('the budget was not checked');
        } catch (ContentRefused $e) {
            $this->assertSame('ai_budget_used_up', $e->errorCode);
            $this->assertSame(403, $e->status);
        }
    }

    public function test_one_generation_at_a_time_per_brand_and_the_brand_is_freed_even_after_a_failure(): void
    {
        $gate = app(ContentAiGate::class);
        $inner = null;
        $gate->oneGenerationAtATime($this->org->id, $this->brandId, function () use ($gate, &$inner) {
            try {
                $gate->oneGenerationAtATime($this->org->id, $this->brandId, fn () => null);
            } catch (ContentRefused $e) {
                $inner = [$e->errorCode, $e->status];
            }
            // Another brand is not held by this one.
            $gate->oneGenerationAtATime($this->org->id, $this->brandId + 1000, fn () => null);
        });
        $this->assertSame(['already_generating', 409], $inner);

        try {
            $gate->oneGenerationAtATime($this->org->id, $this->brandId, fn () => throw new \RuntimeException('provider down'));
        } catch (\RuntimeException) {
        }
        $this->assertSame('ran', $gate->oneGenerationAtATime($this->org->id, $this->brandId, fn () => 'ran'));
    }
}
