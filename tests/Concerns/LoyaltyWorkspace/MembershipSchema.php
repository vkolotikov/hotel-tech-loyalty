<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What HexaTech Loyalty's members area (release 2 §4) needs beyond SetsUpLoyaltyWorkspace: the member's own details
 * on `users`, the welcome email's codes, Sanctum's tokens (deletion signs a member out), member imports, the merge
 * record, and every other table that names a member, so the merge can be shown to move each one (R2-3). Every create
 * is guarded: a narrower helper may have built a table first, and the columns this area reads are then added on top.
 *
 * Called as buildMembershipSchema() after the base schema (setUpLoyaltyWorkspace(), or setUpMemberMergeSchema() in the merge
 * service's test). Not named setUpMembershipSchema: Laravel calls setUp<TraitName>() itself, before the base tables exist.
 */
trait MembershipSchema
{
    protected function buildMembershipSchema(): void
    {
        $this->membershipColumns('users', [
            'date_of_birth'     => fn (Blueprint $t) => $t->date('date_of_birth')->nullable(),
            'nationality'       => fn (Blueprint $t) => $t->string('nationality', 100)->nullable(),
            'avatar_url'        => fn (Blueprint $t) => $t->string('avatar_url')->nullable(),
            'language'          => fn (Blueprint $t) => $t->string('language', 10)->nullable(),
            'email_verified_at' => fn (Blueprint $t) => $t->timestamp('email_verified_at')->nullable(),
        ]);
        $this->membershipColumns('loyalty_members', [
            'referred_by'        => fn (Blueprint $t) => $t->unsignedBigInteger('referred_by')->nullable(),
            'nfc_uid'            => fn (Blueprint $t) => $t->string('nfc_uid', 64)->nullable(),
            'nfc_card_issued_at' => fn (Blueprint $t) => $t->timestamp('nfc_card_issued_at')->nullable(),
            'referral_code'      => fn (Blueprint $t) => $t->string('referral_code', 32)->nullable(),
            'qr_code_token'      => fn (Blueprint $t) => $t->string('qr_code_token', 128)->nullable(),
            'expo_push_token'    => fn (Blueprint $t) => $t->string('expo_push_token')->nullable(),
            'welcomed_at'        => fn (Blueprint $t) => $t->timestamp('welcomed_at')->nullable(),
        ]);
        $this->membershipColumns('guests', [
            'email_key'    => fn (Blueprint $t) => $t->string('email_key')->nullable(),
            'loyalty_tier' => fn (Blueprint $t) => $t->string('loyalty_tier')->nullable(),
            'loyalty_id'   => fn (Blueprint $t) => $t->string('loyalty_id')->nullable(),
        ]);

        $this->membershipTable('email_verification_codes', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->string('email')->index();
            $t->string('code', 6);
            $t->timestamp('expires_at');
            $t->timestamp('verified_at')->nullable();
            $t->timestamps();
        });

        $this->membershipTable('personal_access_tokens', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->string('tokenable_type');
            $t->unsignedBigInteger('tokenable_id');
            $t->string('name');
            $t->string('token', 64)->unique();
            $t->text('abilities')->nullable();
            $t->timestamp('last_used_at')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
        });

        $this->membershipTable('member_import_batches', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->string('uuid', 36)->unique();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('created_by_user_id')->nullable();
            $t->string('original_filename')->nullable();
            $t->string('stored_path', 500)->nullable();
            $t->longText('file_content')->nullable(); // release 3 §2 (2026_10_22_100100)
            $t->unsignedInteger('file_rows')->default(0);
            $t->unsignedInteger('total_rows')->default(0);
            $t->unsignedInteger('processed')->default(0);
            $t->unsignedInteger('ok_count')->default(0);
            $t->unsignedInteger('skip_count')->default(0);
            $t->unsignedInteger('error_count')->default(0);
            $t->unsignedBigInteger('points_awarded')->default(0);
            $t->string('status', 16)->default('pending');
            $t->text('error_message')->nullable();
            $t->text('results')->nullable();
            $t->text('columns_used')->nullable();
            $t->text('columns_ignored')->nullable();
            $t->timestamp('started_at')->nullable();
            $t->timestamp('completed_at')->nullable();
            $t->timestamps();
        });

        $this->membershipTable('member_merges', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id')->nullable();
            $t->unsignedBigInteger('surviving_member_id');
            $t->unsignedBigInteger('merged_member_id');
            $t->text('merged_data')->nullable();
            $t->unsignedBigInteger('performed_by')->nullable();
            $t->text('reason')->nullable();
            $t->timestamps();
        });

        $this->membershipTable('member_offers', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id')->nullable();
            $t->unsignedBigInteger('member_id');
            $t->unsignedBigInteger('offer_id');
            $t->boolean('ai_generated')->default(false);
            $t->text('ai_reason')->nullable();
            $t->timestamp('claimed_at')->nullable();
            $t->timestamp('used_at')->nullable();
            $t->string('used_reference', 60)->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->string('status', 20)->default('available');
            $t->timestamps();
            $t->unique(['member_id', 'offer_id']);
        });

        $this->membershipTable('push_notifications', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id')->nullable();
            $t->unsignedBigInteger('member_id');
            $t->string('type')->default('info');
            $t->string('title')->default('');
            $t->text('body')->nullable();
            $t->text('data')->nullable();
            $t->string('channel', 16)->default('push');
            $t->boolean('is_sent')->default(false);
            $t->timestamps();
        });

        $this->membershipTable('service_bookings', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('member_id')->nullable();
            $t->string('booking_reference', 20)->nullable();
            $t->string('status', 20)->default('confirmed');
            $t->timestamps();
        });

        $this->membershipTable('bookings', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id')->nullable();
            $t->unsignedBigInteger('member_id');
            $t->string('booking_reference', 50)->nullable();
            $t->decimal('total_amount', 12, 2)->nullable();
            $t->timestamps();
        });

        foreach (['ai_conversations', 'ai_recommendations', 'analytics_events', 'member_identities', 'chat_conversations'] as $name) {
            $this->membershipTable($name, function (Blueprint $t) use ($name) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id')->nullable();
                $t->string('label')->nullable();
                if ($name === 'member_identities') {
                    $t->string('type', 30)->default('email');
                    $t->string('identifier')->default('');
                    $t->string('provider', 50)->nullable();
                }
                $t->timestamps();
            });
        }

        foreach (['campaign_recipients', 'review_invitations', 'review_submissions'] as $name) {
            $this->membershipTable($name, function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('loyalty_member_id')->nullable();
                $t->string('label')->nullable();
                $t->timestamps();
            });
        }

        // The rows the merge moves and that SetsUpLoyaltyWorkspace builds; built here too for the merge service's own
        // test, which starts from the narrower merge schema.
        $this->membershipTable('reward_redemptions', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id')->nullable();
            $t->unsignedBigInteger('member_id');
            $t->unsignedBigInteger('reward_id');
            $t->integer('points_spent')->default(0);
            $t->string('code', 16);
            $t->string('status', 16)->default('pending');
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        $this->membershipTable('referrals', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->unsignedBigInteger('organization_id')->nullable();
            $t->unsignedBigInteger('referrer_id');
            $t->unsignedBigInteger('referee_id');
            $t->string('status', 20)->default('pending');
            $t->integer('referrer_points_awarded')->default(0);
            $t->integer('referee_points_awarded')->default(0);
            $t->timestamps();
            $t->unique(['referrer_id', 'referee_id']);
        });
        foreach (['nfc_cards' => 'uid', 'qr_tokens' => 'token', 'scan_events' => 'result', 'benefit_entitlements' => 'status'] as $name => $column) {
            $this->membershipTable($name, function (Blueprint $t) use ($column, $name) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id')->nullable();
                $t->string($column)->default('');
                if ($name === 'qr_tokens') {
                    $t->boolean('is_revoked')->default(false);
                    $t->timestamp('expires_at')->nullable();
                }
                $t->timestamps();
            });
        }
        if (Schema::hasTable('qr_tokens') && !Schema::hasColumn('qr_tokens', 'is_revoked')) {
            Schema::table('qr_tokens', fn (Blueprint $t) => $t->boolean('is_revoked')->default(false));
        }
    }

    /** @param array<string, \Closure(Blueprint): mixed> $add */
    private function membershipColumns(string $table, array $add): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        foreach ($add as $column => $define) {
            if (!Schema::hasColumn($table, $column)) {
                Schema::table($table, $define);
            }
        }
    }

    private function membershipTable(string $name, \Closure $define): void
    {
        if (!Schema::hasTable($name)) {
            Schema::create($name, $define);
        }
    }
}
