<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * CRM Phase 1 — extend inquiries + backfill default pipeline data.
 *
 * Three changes:
 *
 * 1. Adds pipeline_id / pipeline_stage_id / lost_reason_id FK columns
 *    on the inquiries table so deals can join the new pipeline +
 *    lost-reason taxonomy. The existing `status` column stays — it's
 *    still authoritative for legacy code paths and gets kept in sync
 *    with the new pipeline_stage_id.
 *
 * 2. Adds AI-cache columns (ai_brief, ai_brief_at, ai_intent,
 *    ai_win_probability, ai_going_cold_risk, ai_suggested_action) for
 *    the Smart Panel, mirroring the chat_conversations pattern from
 *    Phase 3 of the Engagement Hub.
 *
 * 3. Backfill: every existing org gets a default "Sales" pipeline
 *    seeded with the canonical 8 stages + a default lost-reason
 *    taxonomy. Every existing inquiry's `status` is mapped to the
 *    matching new pipeline_stage_id.
 *
 * The migration is idempotent — re-running on an org that already has
 * the seed pipeline doesn't duplicate it.
 */
return new class extends Migration
{
    /**
     * The canonical default stages for a fresh "Sales" pipeline. Order
     * matters: it sets the visual sequence on the Kanban + the
     * default win-probability ramp used by the Smart Panel.
     *
     * `kind`:  open / won / lost  — drives the won/lost flows
     * `default_win_probability`: starting % for new deals; agent can
     *   override per-deal. Loose progression mirroring industry norms
     *   (see Pipedrive's default funnel: New 10 → Negotiating 70 →
     *   Tentative 90 → Won 100).
     */
    private const DEFAULT_STAGES = [
        ['name' => 'New',           'slug' => 'new',           'kind' => 'open', 'color' => '#3b82f6', 'default_win_probability' => 10],
        ['name' => 'Responded',     'slug' => 'responded',     'kind' => 'open', 'color' => '#6366f1', 'default_win_probability' => 25],
        ['name' => 'Site Visit',    'slug' => 'site-visit',    'kind' => 'open', 'color' => '#a855f7', 'default_win_probability' => 40],
        ['name' => 'Proposal Sent', 'slug' => 'proposal-sent', 'kind' => 'open', 'color' => '#eab308', 'default_win_probability' => 55],
        ['name' => 'Negotiating',   'slug' => 'negotiating',   'kind' => 'open', 'color' => '#f59e0b', 'default_win_probability' => 70],
        ['name' => 'Tentative',     'slug' => 'tentative',     'kind' => 'open', 'color' => '#fb923c', 'default_win_probability' => 90],
        ['name' => 'Confirmed',     'slug' => 'confirmed',     'kind' => 'won',  'color' => '#22c55e', 'default_win_probability' => 100],
        ['name' => 'Lost',          'slug' => 'lost',          'kind' => 'lost', 'color' => '#ef4444', 'default_win_probability' => 0],
    ];

    /**
     * Default lost-reason taxonomy. Hotels can edit / extend per org.
     * Order = display order in the close picker.
     */
    private const DEFAULT_LOST_REASONS = [
        'Price',
        'Unavailable for those dates',
        'Went elsewhere',
        'No response from guest',
        'Disqualified',
        'Other',
    ];

    public function up(): void
    {
        // ── 1. Extend inquiries ──────────────────────────────────────
        if (Schema::hasTable('inquiries')) {
            Schema::table('inquiries', function (Blueprint $t) {
                if (!Schema::hasColumn('inquiries', 'pipeline_id')) {
                    $t->foreignId('pipeline_id')->nullable()->after('brand_id');
                    $t->index(['organization_id', 'pipeline_id'], 'inquiries_org_pipeline_idx');
                }
                if (!Schema::hasColumn('inquiries', 'pipeline_stage_id')) {
                    $t->foreignId('pipeline_stage_id')->nullable()->after('pipeline_id');
                    $t->index('pipeline_stage_id', 'inquiries_stage_idx');
                }
                if (!Schema::hasColumn('inquiries', 'lost_reason_id')) {
                    $t->foreignId('lost_reason_id')->nullable()->after('status');
                }

                // AI Smart Panel cache
                if (!Schema::hasColumn('inquiries', 'ai_brief')) {
                    $t->text('ai_brief')->nullable();
                    $t->timestamp('ai_brief_at')->nullable();
                    $t->string('ai_intent', 32)->nullable();
                    $t->unsignedTinyInteger('ai_win_probability')->nullable();
                    $t->string('ai_going_cold_risk', 16)->nullable();
                    $t->text('ai_suggested_action')->nullable();
                }
            });
        }

        // ── 2. Per-org backfill ─────────────────────────────────────
        $orgIds = DB::table('organizations')->pluck('id');
        $now = now();

        foreach ($orgIds as $orgId) {
            // 2a. Ensure default pipeline exists.
            $pipelineId = DB::table('pipelines')
                ->where('organization_id', $orgId)
                ->where('is_default', true)
                ->value('id');

            if (!$pipelineId) {
                $pipelineId = DB::table('pipelines')->insertGetId([
                    'organization_id' => $orgId,
                    'name'            => 'Sales',
                    'slug'            => 'sales',
                    'description'     => 'Default sales pipeline. Edit stages or add a second pipeline (group sales, MICE, …) from Settings → Pipelines.',
                    'is_default'      => true,
                    'sort_order'      => 0,
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ]);
            }

            // 2b. Seed stages on the default pipeline.
            $existingStageSlugs = DB::table('pipeline_stages')
                ->where('pipeline_id', $pipelineId)
                ->pluck('slug')
                ->all();

            foreach (self::DEFAULT_STAGES as $i => $stage) {
                if (in_array($stage['slug'], $existingStageSlugs, true)) continue;
                DB::table('pipeline_stages')->insert([
                    'organization_id'         => $orgId,
                    'pipeline_id'             => $pipelineId,
                    'name'                    => $stage['name'],
                    'slug'                    => $stage['slug'],
                    'color'                   => $stage['color'],
                    'kind'                    => $stage['kind'],
                    'default_win_probability' => $stage['default_win_probability'],
                    'sort_order'              => $i,
                    'created_at'              => $now,
                    'updated_at'              => $now,
                ]);
            }

            // 2c. Seed default lost-reason taxonomy.
            $existingReasonSlugs = DB::table('inquiry_lost_reasons')
                ->where('organization_id', $orgId)
                ->pluck('slug')
                ->all();

            foreach (self::DEFAULT_LOST_REASONS as $i => $label) {
                $slug = \Illuminate\Support\Str::slug($label);
                if (in_array($slug, $existingReasonSlugs, true)) continue;
                DB::table('inquiry_lost_reasons')->insert([
                    'organization_id' => $orgId,
                    'label'           => $label,
                    'slug'            => $slug,
                    'sort_order'      => $i,
                    'is_active'       => true,
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ]);
            }

            // 2d. Map every existing inquiry's `status` text → new
            // pipeline_stage_id FK. Idempotent: only sets where currently null.
            DB::statement("
                UPDATE inquiries i
                SET pipeline_id = ?, pipeline_stage_id = ps.id
                FROM pipeline_stages ps
                WHERE i.organization_id = ?
                  AND i.pipeline_id IS NULL
                  AND ps.pipeline_id = ?
                  AND lower(ps.name) = lower(i.status)
            ", [$pipelineId, $orgId, $pipelineId]);

            // Anything left without a stage (status doesn't match any
            // canonical name) gets the New stage as a sane default.
            $newStageId = DB::table('pipeline_stages')
                ->where('pipeline_id', $pipelineId)
                ->where('slug', 'new')
                ->value('id');

            if ($newStageId) {
                DB::table('inquiries')
                    ->where('organization_id', $orgId)
                    ->whereNull('pipeline_stage_id')
                    ->update([
                        'pipeline_id'       => $pipelineId,
                        'pipeline_stage_id' => $newStageId,
                    ]);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('inquiries')) {
            Schema::table('inquiries', function (Blueprint $t) {
                if (Schema::hasColumn('inquiries', 'ai_suggested_action'))   $t->dropColumn('ai_suggested_action');
                if (Schema::hasColumn('inquiries', 'ai_going_cold_risk'))    $t->dropColumn('ai_going_cold_risk');
                if (Schema::hasColumn('inquiries', 'ai_win_probability'))    $t->dropColumn('ai_win_probability');
                if (Schema::hasColumn('inquiries', 'ai_intent'))             $t->dropColumn('ai_intent');
                if (Schema::hasColumn('inquiries', 'ai_brief_at'))           $t->dropColumn('ai_brief_at');
                if (Schema::hasColumn('inquiries', 'ai_brief'))              $t->dropColumn('ai_brief');
                if (Schema::hasColumn('inquiries', 'lost_reason_id'))        $t->dropColumn('lost_reason_id');
                if (Schema::hasColumn('inquiries', 'pipeline_stage_id')) {
                    try { $t->dropIndex('inquiries_stage_idx'); } catch (\Throwable $e) {}
                    $t->dropColumn('pipeline_stage_id');
                }
                if (Schema::hasColumn('inquiries', 'pipeline_id')) {
                    try { $t->dropIndex('inquiries_org_pipeline_idx'); } catch (\Throwable $e) {}
                    $t->dropColumn('pipeline_id');
                }
            });
        }
    }
};
