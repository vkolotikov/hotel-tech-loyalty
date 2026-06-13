<?php

namespace Database\Factories;

use App\Models\AiUsageLog;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AiUsageLog>
 *
 * AiUsageLog has $timestamps = false and is append-only — the model
 * does NOT auto-fill created_at, so callers that need a specific
 * timestamp (last-month rows, mid-month aggregates) must pass it
 * explicitly. The factory's default leaves it null so the DB default
 * (CURRENT_TIMESTAMP) fires for the "now" case.
 */
class AiUsageLogFactory extends Factory
{
    protected $model = AiUsageLog::class;

    public function definition(): array
    {
        // organization_id intentionally OMITTED so the BelongsToOrganization
        // trait fills it from current_organization_id when bound. Cross-
        // tenant tests must raw-insert via DB::table('ai_usage_logs')
        // ->insert(...) like the other factories in this suite.
        return [
            'model'         => fake()->randomElement([
                'gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini',
                'claude-sonnet-4-20250514', 'claude-haiku-4-5',
            ]),
            'kind'          => 'chat',
            'feature'       => fake()->randomElement([
                'crm_chat', 'website_chatbot', 'engagement_brief',
                'inquiry_smart_panel', 'sentiment_analysis',
            ]),
            'input_tokens'  => fake()->numberBetween(100, 5_000),
            'output_tokens' => fake()->numberBetween(50, 2_000),
            'cost_cents'    => fake()->numberBetween(1, 500),
        ];
    }

    public function lastMonth(): static
    {
        return $this->state(['created_at' => now()->subMonth()->startOfMonth()->addDays(5)]);
    }

    public function thisMonth(): static
    {
        return $this->state(['created_at' => now()->startOfMonth()->addDays(2)]);
    }

    public function embedding(): static
    {
        return $this->state([
            'model'         => 'text-embedding-3-small',
            'kind'          => 'embedding',
            'output_tokens' => 0,
        ]);
    }
}
