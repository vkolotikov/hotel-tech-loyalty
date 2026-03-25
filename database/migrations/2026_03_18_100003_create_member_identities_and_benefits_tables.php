<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Member identity resolution — multiple identifiers per member
        if (!Schema::hasTable('member_identities')) {
            Schema::create('member_identities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $table->string('type', 30);
                $table->string('identifier'); // the actual value
                $table->string('provider', 50)->nullable(); // "opera", "mews", "booking.com"
                $table->boolean('is_verified')->default(false);
                $table->boolean('is_primary')->default(false);
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();

                $table->unique(['type', 'identifier', 'provider']);
                $table->index('member_id');
                $table->index('identifier');
            });
        }

        // Member merge history
        if (!Schema::hasTable('member_merges')) {
            Schema::create('member_merges', function (Blueprint $table) {
                $table->id();
                $table->foreignId('surviving_member_id')->constrained('loyalty_members');
                $table->unsignedBigInteger('merged_member_id'); // may be deleted
                $table->json('merged_data'); // snapshot of merged member's data
                $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('reason')->nullable();
                $table->timestamps();

                $table->index('surviving_member_id');
            });
        }

        // Benefit definitions — what a tier/property offers
        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 50)->unique();
                $table->text('description')->nullable();
                $table->string('category', 30)->default('other');
                $table->string('fulfillment_mode', 30)->default('on_request');
                $table->integer('usage_limit_per_stay')->nullable();
                $table->integer('usage_limit_per_year')->nullable();
                $table->boolean('requires_active_stay')->default(true);
                $table->json('operational_constraints')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // Which benefits are available per tier (and optionally per property)
        if (!Schema::hasTable('tier_benefits')) {
            Schema::create('tier_benefits', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tier_id')->constrained('loyalty_tiers')->cascadeOnDelete();
                $table->foreignId('benefit_id')->constrained('benefit_definitions')->cascadeOnDelete();
                $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
                $table->string('value')->nullable();
                $table->text('custom_description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->unique(['tier_id', 'benefit_id', 'property_id']);
            });
        }

        // Member benefit entitlements — runtime tracking
        if (!Schema::hasTable('benefit_entitlements')) {
            Schema::create('benefit_entitlements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $table->foreignId('benefit_id')->constrained('benefit_definitions')->cascadeOnDelete();
                $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
                $table->string('status', 20)->default('eligible');
                $table->foreignId('actioned_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('decline_reason')->nullable();
                $table->timestamp('requested_at')->nullable();
                $table->timestamp('fulfilled_at')->nullable();
                $table->timestamps();

                $table->index(['member_id', 'status']);
                $table->index('booking_id');
            });
        }

        // Offer rules / eligibility conditions
        if (!Schema::hasTable('offer_rules')) {
            Schema::create('offer_rules', function (Blueprint $table) {
                $table->id();
                $table->foreignId('offer_id')->constrained('special_offers')->cascadeOnDelete();
                $table->string('rule_type', 50);
                $table->string('operator', 20)->default('eq');
                $table->json('value');
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index('offer_id');
            });
        }

        // Enhance special_offers with guardrails
        if (!Schema::hasColumn('special_offers', 'budget_cap')) {
            Schema::table('special_offers', function (Blueprint $table) {
                $table->decimal('budget_cap', 12, 2)->nullable();
                $table->decimal('budget_used', 12, 2)->default(0);
                $table->json('blackout_dates')->nullable();
                $table->json('mutually_exclusive_ids')->nullable();
                $table->boolean('requires_approval')->default(false);
                $table->boolean('requires_active_stay')->default(false);
                $table->boolean('staff_only')->default(false);
                $table->boolean('stackable')->default(true);
                $table->string('reward_action', 50)->nullable();
            });
        }

        // Enhance audit_logs with property scope and severity
        if (!Schema::hasColumn('audit_logs', 'severity')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
                $table->string('severity', 20)->default('info');
                $table->string('channel', 30)->nullable();
            });
        }

        // Campaign segments — reusable audience definitions
        if (!Schema::hasTable('campaign_segments')) {
            Schema::create('campaign_segments', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->text('description')->nullable();
                $table->json('rules');
                $table->integer('estimated_size')->default(0);
                $table->timestamp('last_computed_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->boolean('is_dynamic')->default(true);
                $table->timestamps();
            });
        }

        // Enhance notification_campaigns
        if (!Schema::hasColumn('notification_campaigns', 'segment_id')) {
            Schema::table('notification_campaigns', function (Blueprint $table) {
                $table->foreignId('segment_id')->nullable()->constrained('campaign_segments')->nullOnDelete();
                $table->integer('holdout_percentage')->default(0);
                $table->string('ab_variant', 1)->nullable();
                $table->foreignId('ab_parent_id')->nullable()->constrained('notification_campaigns')->nullOnDelete();
                $table->json('delivery_stats')->nullable();
                $table->decimal('attributed_revenue', 12, 2)->default(0);
            });
        }

        // Scan events — detailed log of every QR/NFC scan
        if (!Schema::hasTable('scan_events')) {
            Schema::create('scan_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
                $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('staff_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('scan_type', 10);
                $table->string('token_value')->nullable();
                $table->string('result', 30);
                $table->string('action_taken', 20)->default('none');
                $table->foreignId('transaction_id')->nullable()->constrained('points_transactions')->nullOnDelete();
                $table->string('device_id', 100)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->timestamps();

                $table->index('member_id');
                $table->index('property_id');
                $table->index('created_at');
                $table->index('result');
            });
        }

        // QR tokens — rotating, signed, expiring
        if (!Schema::hasTable('qr_tokens')) {
            Schema::create('qr_tokens', function (Blueprint $table) {
                $table->id();
                $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $table->string('token', 128)->unique();
                $table->string('signature', 128);
                $table->timestamp('issued_at');
                $table->timestamp('expires_at');
                $table->integer('max_uses')->default(1);
                $table->integer('use_count')->default(0);
                $table->boolean('is_revoked')->default(false);
                $table->timestamps();

                $table->index('token');
                $table->index(['member_id', 'is_revoked']);
                $table->index('expires_at');
            });
        }

        // Domain events log — internal event bus
        if (!Schema::hasTable('domain_events')) {
            Schema::create('domain_events', function (Blueprint $table) {
                $table->id();
                $table->string('event_type', 100);
                $table->string('aggregate_type', 100);
                $table->unsignedBigInteger('aggregate_id');
                $table->json('payload');
                $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
                $table->boolean('is_processed')->default(false);
                $table->timestamp('processed_at')->nullable();
                $table->timestamps();

                $table->index('event_type');
                $table->index(['aggregate_type', 'aggregate_id']);
                $table->index('is_processed');
                $table->index('created_at');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('domain_events');
        Schema::dropIfExists('qr_tokens');
        Schema::dropIfExists('scan_events');

        Schema::table('notification_campaigns', function (Blueprint $table) {
            $table->dropForeign(['segment_id']);
            $table->dropForeign(['ab_parent_id']);
            $table->dropColumn(['segment_id', 'holdout_percentage', 'ab_variant', 'ab_parent_id', 'delivery_stats', 'attributed_revenue']);
        });

        Schema::dropIfExists('campaign_segments');

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('property_id');
            $table->dropColumn(['severity', 'channel']);
        });

        Schema::table('special_offers', function (Blueprint $table) {
            $table->dropColumn(['budget_cap', 'budget_used', 'blackout_dates', 'mutually_exclusive_ids', 'requires_approval', 'requires_active_stay', 'staff_only', 'stackable', 'reward_action']);
        });

        Schema::dropIfExists('offer_rules');
        Schema::dropIfExists('benefit_entitlements');
        Schema::dropIfExists('tier_benefits');
        Schema::dropIfExists('benefit_definitions');
        Schema::dropIfExists('member_merges');
        Schema::dropIfExists('member_identities');
    }
};
