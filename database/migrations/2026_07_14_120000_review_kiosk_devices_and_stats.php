<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Survey platform upgrade for the Reviews module (2026-07):
 *
 *  - review_devices — registered kiosk tablets (reception iPad, spa
 *    counter, restaurant exit). Each device has a stable device_key;
 *    the kiosk opens /k/{device_key} once and the ASSIGNMENT decides
 *    which survey it shows — reassigning in the admin repoints the
 *    tablet without touching it.
 *  - review_submissions.device_id + channel — attribution for the
 *    per-survey analytics (kiosk vs embed vs invitation vs link).
 *  - review_form_stats — one row per form × day with view/submission
 *    counters, powering completion-rate + trend charts without
 *    scanning the submissions table.
 *
 * Theme/design customization needs NO schema — it lives in the
 * existing review_forms.config json under a `theme` key.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('review_devices')) {
            Schema::create('review_devices', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('form_id')->nullable()->constrained('review_forms')->nullOnDelete();
                $t->string('name');
                $t->string('location')->nullable();
                $t->string('device_key', 64)->unique();
                $t->boolean('is_active')->default(true);
                $t->timestamp('last_seen_at')->nullable();
                $t->timestamps();

                $t->index(['organization_id', 'is_active']);
            });
        }

        if (!Schema::hasColumn('review_submissions', 'device_id')) {
            Schema::table('review_submissions', function (Blueprint $t) {
                $t->foreignId('device_id')->nullable()->after('invitation_id')
                    ->constrained('review_devices')->nullOnDelete();
                // link | embed | kiosk | invitation | qr
                $t->string('channel', 20)->nullable()->after('device_id');
            });
        }

        if (!Schema::hasTable('review_form_stats')) {
            Schema::create('review_form_stats', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('form_id')->constrained('review_forms')->cascadeOnDelete();
                $t->date('date');
                $t->unsignedInteger('views')->default(0);
                $t->unsignedInteger('submissions')->default(0);
                $t->timestamps();

                $t->unique(['form_id', 'date']);
                $t->index(['organization_id', 'date']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('review_submissions', function (Blueprint $t) {
            $t->dropConstrainedForeignId('device_id');
            $t->dropColumn('channel');
        });
        Schema::dropIfExists('review_form_stats');
        Schema::dropIfExists('review_devices');
    }
};
