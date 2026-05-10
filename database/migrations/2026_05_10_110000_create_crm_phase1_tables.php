<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * CRM Phase 1 — schema foundation.
 *
 * Five new tables that turn the existing flat-Inquiry CRM into a real
 * sales tool: pipelines + pipeline_stages (multi-pipeline support),
 * inquiry_lost_reasons (lookup for required lost-reason capture),
 * activities (unified timeline log — every note / call / email / chat
 * / status_change), and tasks (first-class planned activities).
 *
 * The accompanying migration 2026_05_10_110001 then adds FKs on the
 * inquiries table itself + the AI-cache columns + backfill data so the
 * platform can switch from the hardcoded `status` string to the
 * pipeline_stage_id FK without breaking existing rows.
 *
 * See apps/loyalty/CRM_IMPROVEMENT_PLAN.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── pipelines (one per use case — Sales / MICE / Group / etc.) ──
        if (!Schema::hasTable('pipelines')) {
            Schema::create('pipelines', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('brand_id')->nullable()->after('organization_id');
                $t->string('name', 80);
                $t->string('slug', 80);
                $t->text('description')->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->timestamps();

                $t->unique(['organization_id', 'slug'], 'pipelines_org_slug_unique');
                $t->index(['organization_id', 'brand_id'], 'pipelines_org_brand_idx');
            });

            // Exactly-one-default pipeline per org (Postgres partial unique).
            DB::statement('CREATE UNIQUE INDEX pipelines_org_default_unique ON pipelines (organization_id) WHERE is_default = true');
        }

        // ── pipeline_stages (NEW / RESPONDED / WON / LOST / etc.) ──
        if (!Schema::hasTable('pipeline_stages')) {
            Schema::create('pipeline_stages', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('pipeline_id')->constrained()->cascadeOnDelete();
                $t->string('name', 60);
                $t->string('slug', 60);
                $t->string('color', 20)->nullable();
                /**
                 * Categorises stages for logic + reporting:
                 *   open    → in flight, counts toward forecast
                 *   won     → closed-won, triggers Convert-to-reservation
                 *   lost    → closed-lost, triggers required lost-reason capture
                 * The frontend treats these as the only meaningful states; the
                 * stage name is purely cosmetic + for ordering inside open.
                 */
                $t->string('kind', 16)->default('open');
                $t->integer('sort_order')->default(0);
                $t->integer('default_win_probability')->nullable();
                $t->timestamps();

                $t->unique(['pipeline_id', 'slug'], 'pipeline_stages_pipeline_slug_unique');
                $t->index(['organization_id', 'pipeline_id'], 'pipeline_stages_org_pipeline_idx');
            });
        }

        // ── inquiry_lost_reasons (taxonomy for required lost-reason capture) ──
        if (!Schema::hasTable('inquiry_lost_reasons')) {
            Schema::create('inquiry_lost_reasons', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->string('label', 80);
                $t->string('slug', 80);
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();

                $t->unique(['organization_id', 'slug'], 'lost_reasons_org_slug_unique');
            });
        }

        // ── activities (unified timeline log on inquiries) ──
        if (!Schema::hasTable('activities')) {
            Schema::create('activities', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('brand_id')->nullable();

                // Polymorphic-ish links — most activities attach to an inquiry,
                // some attach to just a guest or a company. Nullable on
                // purpose; the activity feed query joins through whichever is
                // set. Indexed on (inquiry_id, occurred_at) for fast feed
                // scans which is by far the dominant access pattern.
                $t->foreignId('inquiry_id')->nullable()->constrained()->cascadeOnDelete();
                $t->foreignId('guest_id')->nullable();
                $t->foreignId('corporate_account_id')->nullable();

                /**
                 * Activity type — drives icon, formatting, and which fields
                 * are populated. Matches the timeline tab filter chips.
                 *   note            free-text note
                 *   call            logged call (uses duration_minutes)
                 *   email           outbound email (subject + body)
                 *   meeting         logged meeting (uses duration_minutes)
                 *   chat            chat conversation (link via metadata.conversation_id)
                 *   status_change   pipeline_stage transition
                 *   task_completed  task was marked complete
                 *   file            file attachment
                 *   system          auto-generated event (lead created, won,
                 *                   lost, etc.)
                 */
                $t->string('type', 32);
                $t->string('direction', 16)->nullable();   // inbound / outbound for emails+calls
                $t->string('subject', 200)->nullable();
                $t->text('body')->nullable();
                $t->integer('duration_minutes')->nullable();
                $t->json('metadata')->nullable();          // type-specific extras: from/to email, attachments, etc.

                $t->foreignId('created_by')->nullable();   // user_id — null for system activities
                $t->timestamp('occurred_at')->index();     // when the thing happened (≠ created_at)
                $t->timestamps();

                $t->index(['inquiry_id', 'occurred_at'], 'activities_inquiry_time_idx');
                $t->index(['organization_id', 'type', 'occurred_at'], 'activities_org_type_time_idx');
                $t->index(['guest_id', 'occurred_at'], 'activities_guest_time_idx');
            });
        }

        // ── tasks (first-class planned activities, replaces inquiry.next_task_*) ──
        if (!Schema::hasTable('tasks')) {
            Schema::create('tasks', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('brand_id')->nullable();

                // A task can attach to one of: an inquiry, a guest, or a
                // company (or none — a standalone reminder). At least one
                // is the typical pattern. Cascade on inquiry delete so a
                // closed-and-purged inquiry doesn't leave orphan tasks.
                $t->foreignId('inquiry_id')->nullable()->constrained()->cascadeOnDelete();
                $t->foreignId('guest_id')->nullable();
                $t->foreignId('corporate_account_id')->nullable();

                /**
                 * Task type — drives default duration, icon, and what's
                 * shown in the task drawer.
                 *   call / email / meeting / send_proposal / follow_up /
                 *   site_visit / custom
                 */
                $t->string('type', 32)->default('follow_up');
                $t->string('title', 200);
                $t->text('description')->nullable();

                $t->timestamp('due_at')->nullable()->index();
                $t->foreignId('assigned_to')->nullable();    // user id
                $t->foreignId('created_by')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->string('outcome', 60)->nullable();       // free-text or enum, set on complete
                $t->json('recurring_rule')->nullable();      // future — RRULE-shaped object

                $t->timestamps();

                $t->index(['organization_id', 'assigned_to', 'completed_at', 'due_at'], 'tasks_inbox_idx');
                $t->index(['inquiry_id', 'completed_at'], 'tasks_inquiry_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
        Schema::dropIfExists('activities');
        Schema::dropIfExists('inquiry_lost_reasons');
        Schema::dropIfExists('pipeline_stages');
        DB::statement('DROP INDEX IF EXISTS pipelines_org_default_unique');
        Schema::dropIfExists('pipelines');
    }
};
