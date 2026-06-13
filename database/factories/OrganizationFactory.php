<?php

namespace Database\Factories;

use App\Models\Organization;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Organization>
 */
class OrganizationFactory extends Factory
{
    protected $model = Organization::class;

    public function definition(): array
    {
        $name = fake()->company();
        return [
            'name'         => $name,
            'slug'         => Str::slug($name) . '-' . Str::random(6),
            'saas_org_id'  => 'cmtst_' . Str::random(24),
            'widget_token' => Str::random(32),
            'industry'     => 'hotel',
            'is_active'    => true,
        ];
    }

    public function hotel(): static
    {
        return $this->state(['industry' => 'hotel']);
    }

    public function beauty(): static
    {
        return $this->state(['industry' => 'beauty']);
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }

    /**
     * Attach a plan_features map (the same shape SaasAuthMiddleware
     * caches from the SaaS bootstrap response). Used by tests that
     * exercise feature-gated flows — AiUsageService cap + allowlist,
     * the upgrade modal, etc.
     */
    public function withFeatures(array $features): static
    {
        return $this->state(['plan_features' => $features]);
    }

    /** Convenience: org with a monthly AI cost cap (in cents). */
    public function withAiCostCap(int $cents): static
    {
        return $this->withFeatures(['ai_monthly_cost_cents' => $cents]);
    }

    /** Convenience: org with an AI model allowlist. */
    public function withAiAllowedModels(array $models): static
    {
        return $this->withFeatures(['ai_allowed_models' => $models]);
    }
}
