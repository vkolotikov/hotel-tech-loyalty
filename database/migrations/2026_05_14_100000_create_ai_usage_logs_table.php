<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-call AI usage ledger. Every chat-completion / embeddings / function-call
 * we make to OpenAI or Anthropic writes one row here so we can:
 *   - bill per-org accurately (cost_cents = exact dollar cost in cents),
 *   - cap monthly spend per plan tier (ai_monthly_cost_cents entitlement),
 *   - gate which models a plan can hit (ai_allowed_models entitlement),
 *   - show admins where their AI dollars are going by feature.
 *
 * Stored cost is computed at write-time from the model's known input/output
 * price in AiUsageService::MODEL_PRICING. We persist cost_cents directly
 * (rather than just tokens) so historical reports survive future price
 * changes — the dollar amount we paid is a fact, the price/1M tokens we
 * paid it at is variable. Tokens kept too for debugging.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_usage_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // Provider-agnostic model id e.g. "claude-sonnet-4-6", "gpt-4o-mini",
            // "text-embedding-3-small". Used both for cost lookup and as a
            // dimension in the breakdown report.
            $t->string('model', 80);
            // Distinguishes embeddings/transcription from chat completions so
            // pricing math picks the right column from MODEL_PRICING.
            $t->string('kind', 20)->default('chat'); // chat | embedding | transcription
            // Feature label — drives the "where is the cost going" breakdown.
            // Examples: 'crm_chat', 'website_chatbot', 'engagement_intent',
            // 'inquiry_brief', 'inquiry_proposal', 'knowledge_embed', etc.
            $t->string('feature', 60);
            $t->unsignedInteger('input_tokens')->default(0);
            $t->unsignedInteger('output_tokens')->default(0);
            // Cost in USD cents, rounded up so we never under-count. uint to
            // catch any negative-cost bug at the column level.
            $t->unsignedInteger('cost_cents')->default(0);
            $t->timestamp('created_at')->useCurrent();

            // Reports always slice by org + month, so a composite index on
            // (organization_id, created_at) makes the monthly-aggregate query
            // and the per-feature breakdown both index-only scans.
            $t->index(['organization_id', 'created_at']);
            $t->index(['organization_id', 'feature']);
            $t->index(['organization_id', 'model']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_usage_logs');
    }
};
