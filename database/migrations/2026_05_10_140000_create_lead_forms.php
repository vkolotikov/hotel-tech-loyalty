<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CRM Phase 10 — embeddable lead-capture forms.
 *
 * One lead_forms table holds the schema (name, fields, design) per
 * org. Submissions land in lead_form_submissions with the raw payload
 * + foreign keys to the Guest / Inquiry that got created. Inquiries
 * grow a lead_form_id FK so the funnel report can attribute leads to
 * the form that captured them.
 *
 * Embed pattern mirrors the existing booking widget: each form has an
 * `embed_key` (random URL token), the admin pastes an <iframe src=
 * "/form/{key}"> snippet on their site, and the form posts to a public
 * (no-auth) endpoint that creates the lead.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('lead_forms')) {
            Schema::create('lead_forms', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('brand_id')->nullable();

                /** Admin-facing label. Shown in the admin list. */
                $t->string('name', 120);

                /**
                 * Public URL token. Forms are public so the token is the
                 * only thing that gates them — keep it long + random
                 * (32 chars). Regenerable from the admin if a form is
                 * leaked / spammed.
                 */
                $t->string('embed_key', 40)->unique();

                $t->text('description')->nullable();

                /**
                 * Defaults applied to inquiries created through this
                 * form. Admins can override via the form's Defaults
                 * tab so e.g. a "MICE inquiry" form auto-tags
                 * inquiry_type=Event/MICE without the visitor
                 * picking it.
                 */
                $t->string('default_source', 100)->default('website_form');
                $t->string('default_inquiry_type', 50)->nullable();
                $t->foreignId('default_property_id')->nullable();
                $t->string('default_assigned_to', 150)->nullable();

                /**
                 * Field config. Array of { key, type, label,
                 * placeholder, required, enabled, options? } objects.
                 * Built-in keys: name, email, phone, inquiry_type,
                 * check_in, check_out, num_people, message. Anything
                 * else is a per-form custom field.
                 */
                $t->jsonb('fields')->nullable();

                /**
                 * Visual config: { title, intro, submit_text,
                 * success_title, success_message, primary_color,
                 * theme, corners, show_privacy_link, ... }.
                 */
                $t->jsonb('design')->nullable();

                $t->boolean('is_active')->default(true);

                /**
                 * Denormalised counters so the admin list shows volume
                 * at a glance without a SUM-per-row query.
                 */
                $t->unsignedInteger('submission_count')->default(0);
                $t->timestamp('last_submitted_at')->nullable();

                $t->timestamps();

                $t->index(['organization_id', 'is_active'], 'lead_forms_org_active_idx');
            });
        }

        if (!Schema::hasTable('lead_form_submissions')) {
            Schema::create('lead_form_submissions', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('lead_form_id')->constrained()->cascadeOnDelete();

                /** Raw submitted values, before validation/mapping. */
                $t->jsonb('payload');

                $t->foreignId('guest_id')->nullable();
                $t->foreignId('inquiry_id')->nullable();

                $t->string('ip', 45)->nullable();
                $t->text('user_agent')->nullable();
                $t->text('referrer')->nullable();

                /**
                 * Reserved for v2 anti-spam:
                 *   processed | spam | error
                 * Today we always set 'processed' on success.
                 */
                $t->string('status', 20)->default('processed');
                $t->text('error_message')->nullable();

                $t->timestamps();

                $t->index(['organization_id', 'lead_form_id', 'created_at'], 'lf_submissions_lookup_idx');
            });
        }

        if (Schema::hasTable('inquiries') && !Schema::hasColumn('inquiries', 'lead_form_id')) {
            Schema::table('inquiries', function (Blueprint $t) {
                $t->foreignId('lead_form_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('inquiries') && Schema::hasColumn('inquiries', 'lead_form_id')) {
            Schema::table('inquiries', function (Blueprint $t) {
                $t->dropColumn('lead_form_id');
            });
        }
        Schema::dropIfExists('lead_form_submissions');
        Schema::dropIfExists('lead_forms');
    }
};
