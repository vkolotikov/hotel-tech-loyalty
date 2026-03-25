<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Enhance existing points_transactions into a proper append-only ledger
        Schema::table('points_transactions', function (Blueprint $table) {
            // Expand type to cover all transaction categories
            $table->string('type', 30)->change(); // will hold: earn, redeem, expire, adjust, bonus, referral, reverse, campaign, goodwill, stay_completion, fnb_spend, spa_spend, ancillary, tier_bonus

            // Multi-property scope
            $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('outlet_id')->nullable()->constrained()->nullOnDelete();

            // Source tracking (what triggered this transaction)
            $table->string('source_type', 50)->nullable(); // pms, pos, admin, mobile, api, webhook, system
            $table->string('source_id', 100)->nullable();   // external reference

            // Qualifying vs redeemable separation
            $table->integer('qualifying_points')->default(0); // points that count toward tier qualification

            // Idempotency & reversal
            $table->string('idempotency_key', 100)->nullable();
            $table->foreignId('reversal_of_id')->nullable()->constrained('points_transactions')->nullOnDelete();
            $table->boolean('is_reversed')->default(false);

            // Reason codes & approval
            $table->string('reason_code', 50)->nullable(); // welcome, stay, spend, manual_courtesy, service_recovery, correction, etc.
            $table->string('approval_status', 30)->default('auto_approved');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            // Expiry bucket reference
            $table->foreignId('expiry_bucket_id')->nullable();

            // Indexes
            $table->index('property_id');
            $table->index('idempotency_key');
            $table->index('reason_code');
            $table->index('approval_status');
            $table->index('is_reversed');
        });

        // Point expiry buckets — each earn creates a bucket that expires independently
        Schema::create('point_expiry_buckets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->foreignId('transaction_id')->constrained('points_transactions')->cascadeOnDelete();
            $table->integer('original_points');
            $table->integer('remaining_points');
            $table->date('earned_at');
            $table->date('expires_at');
            $table->boolean('is_expired')->default(false);
            $table->timestamps();

            $table->index('member_id');
            $table->index('expires_at');
            $table->index(['member_id', 'is_expired', 'expires_at']);
        });

        // Enhance loyalty_members with qualifying points and tier assessment
        Schema::table('loyalty_members', function (Blueprint $table) {
            $table->bigInteger('qualifying_points')->default(0);
            $table->date('tier_review_date')->nullable();
            $table->date('tier_effective_from')->nullable();
            $table->date('tier_effective_until')->nullable();
            $table->string('tier_qualification_model', 20)->default('points');
            $table->integer('qualifying_nights')->default(0);
            $table->integer('qualifying_stays')->default(0);
            $table->decimal('qualifying_spend', 12, 2)->default(0);
            $table->boolean('tier_locked')->default(false); // prevents downgrade (invitation tier, etc.)
            $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete(); // home property
        });

        // Enhance loyalty_tiers with qualification windows and rules
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->integer('min_nights')->nullable();
            $table->integer('min_stays')->nullable();
            $table->decimal('min_spend', 12, 2)->nullable();
            $table->string('qualification_window', 30)->default('rolling_12');
            $table->integer('grace_period_days')->default(90);
            $table->boolean('soft_landing')->default(true); // only drop one tier at a time
            $table->boolean('invitation_only')->default(false);
            $table->decimal('points_to_currency_rate', 8, 4)->default(0.01); // 1 point = $0.01
        });

        // Tier assessment history — tracks every tier evaluation
        Schema::create('tier_assessments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->foreignId('old_tier_id')->constrained('loyalty_tiers');
            $table->foreignId('new_tier_id')->constrained('loyalty_tiers');
            $table->string('reason', 30);
            $table->bigInteger('qualifying_points_at_assessment')->default(0);
            $table->integer('qualifying_nights_at_assessment')->default(0);
            $table->integer('qualifying_stays_at_assessment')->default(0);
            $table->decimal('qualifying_spend_at_assessment', 12, 2)->default(0);
            $table->date('assessment_window_start');
            $table->date('assessment_window_end');
            $table->foreignId('assessed_by')->nullable()->constrained('users')->nullOnDelete(); // null = system
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('member_id');
            $table->index('created_at');
        });

        // Add foreign key for expiry_bucket_id now that the table exists
        Schema::table('points_transactions', function (Blueprint $table) {
            $table->foreign('expiry_bucket_id')->references('id')->on('point_expiry_buckets')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('points_transactions', function (Blueprint $table) {
            $table->dropForeign(['expiry_bucket_id']);
        });

        Schema::dropIfExists('tier_assessments');

        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->dropColumn(['min_nights', 'min_stays', 'min_spend', 'qualification_window', 'grace_period_days', 'soft_landing', 'invitation_only', 'points_to_currency_rate']);
        });

        Schema::table('loyalty_members', function (Blueprint $table) {
            $table->dropConstrainedForeignId('property_id');
            $table->dropColumn(['qualifying_points', 'tier_review_date', 'tier_effective_from', 'tier_effective_until', 'tier_qualification_model', 'qualifying_nights', 'qualifying_stays', 'qualifying_spend', 'tier_locked']);
        });

        Schema::dropIfExists('point_expiry_buckets');

        Schema::table('points_transactions', function (Blueprint $table) {
            $table->dropForeign(['property_id']);
            $table->dropForeign(['outlet_id']);
            $table->dropForeign(['reversal_of_id']);
            $table->dropForeign(['approved_by']);
            $table->dropColumn([
                'property_id', 'outlet_id', 'source_type', 'source_id',
                'qualifying_points', 'idempotency_key', 'reversal_of_id', 'is_reversed',
                'reason_code', 'approval_status', 'approved_by', 'approved_at', 'expiry_bucket_id',
            ]);
        });
    }
};
