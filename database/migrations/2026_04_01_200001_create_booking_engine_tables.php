<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /* ───── Booking Holds — temporary price quotes with expiry ───── */
        if (!Schema::hasTable('booking_holds')) {
            Schema::create('booking_holds', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->string('hold_token', 64)->unique();
                $table->string('status', 20)->default('active')->index(); // active, expired, consumed, cancelled
                $table->timestamp('expires_at')->index();
                $table->jsonb('payload_json')->nullable();
                $table->timestamps();

                $table->index('organization_id');
            });
        }

        /* ───── Booking Submissions — record of every booking attempt ───── */
        if (!Schema::hasTable('booking_submissions')) {
            Schema::create('booking_submissions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->string('request_id', 64)->nullable();
                $table->string('idempotency_key', 128)->nullable();
                $table->string('outcome', 20)->index(); // success, failure
                $table->string('failure_code', 60)->nullable();
                $table->text('failure_message')->nullable();
                $table->string('booking_reference', 60)->nullable()->index();
                $table->string('reservation_id', 60)->nullable();
                $table->foreignId('guest_id')->nullable()->constrained('guests')->nullOnDelete();
                $table->string('guest_name', 180)->nullable();
                $table->string('guest_email', 180)->nullable()->index();
                $table->string('guest_phone', 40)->nullable();
                $table->string('unit_id', 20)->nullable();
                $table->string('unit_name', 120)->nullable();
                $table->date('check_in')->nullable();
                $table->date('check_out')->nullable();
                $table->smallInteger('adults')->nullable();
                $table->smallInteger('children')->nullable();
                $table->decimal('gross_total', 12, 2)->nullable();
                $table->string('payment_method', 40)->nullable();
                $table->string('payment_status', 40)->nullable();
                $table->jsonb('payload_json')->nullable();
                $table->timestamps();

                $table->index('organization_id');
                $table->index('created_at');
            });
        }

        /* ───── Booking Mirror — synced reservations from PMS (Smoobu etc.) ───── */
        if (!Schema::hasTable('booking_mirror')) {
            Schema::create('booking_mirror', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->string('reservation_id', 30)->index();
                $table->string('booking_reference', 60)->nullable();
                $table->string('booking_type', 40)->nullable();
                $table->string('booking_state', 40)->nullable()->index();
                $table->string('apartment_id', 20)->nullable()->index();
                $table->string('apartment_name', 180)->nullable();
                $table->string('channel_id', 20)->nullable();
                $table->string('channel_name', 80)->nullable();
                // Link to CRM guest if matched
                $table->foreignId('guest_id')->nullable()->constrained('guests')->nullOnDelete();
                $table->string('guest_name', 180)->nullable();
                $table->string('guest_email', 180)->nullable();
                $table->string('guest_phone', 40)->nullable();
                $table->string('guest_language', 10)->nullable();
                $table->smallInteger('adults')->nullable();
                $table->smallInteger('children')->nullable();
                $table->date('arrival_date')->nullable()->index();
                $table->date('departure_date')->nullable()->index();
                $table->time('check_in_time')->nullable();
                $table->time('check_out_time')->nullable();
                $table->decimal('price_total', 12, 2)->nullable();
                $table->decimal('price_paid', 12, 2)->nullable();
                $table->decimal('prepayment_amount', 12, 2)->nullable();
                $table->boolean('prepayment_paid')->default(false);
                $table->decimal('deposit_amount', 12, 2)->nullable();
                $table->boolean('deposit_paid')->default(false);
                $table->text('notice')->nullable();
                $table->text('assistant_notice')->nullable();
                $table->string('guest_app_url', 512)->nullable();
                $table->string('payment_method', 40)->nullable();
                $table->string('payment_status', 40)->nullable()->index();
                $table->string('internal_status', 40)->default('new')->index();
                $table->string('invoice_state', 40)->default('none');
                $table->timestamp('source_created_at')->nullable();
                $table->timestamp('source_updated_at')->nullable();
                $table->timestamp('synced_at')->nullable();
                $table->jsonb('raw_json')->nullable();
                $table->timestamps();

                $table->unique(['organization_id', 'reservation_id']);
                $table->index('organization_id');
            });
        }

        /* ───── Booking Price Elements — line items for mirror bookings ───── */
        if (!Schema::hasTable('booking_price_elements')) {
            Schema::create('booking_price_elements', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('booking_mirror_id');
                $table->string('reservation_id', 30)->index();
                $table->string('remote_price_element_id', 30)->nullable();
                $table->string('element_type', 40)->nullable();
                $table->string('name', 180)->nullable();
                $table->decimal('amount', 12, 2)->nullable();
                $table->integer('quantity')->default(1);
                $table->decimal('tax', 8, 2)->nullable();
                $table->string('currency_code', 3)->default('EUR');
                $table->smallInteger('sort_order')->default(0);
                $table->jsonb('raw_json')->nullable();
                $table->timestamp('synced_at')->nullable();
                $table->timestamps();

                $table->foreign('booking_mirror_id')->references('id')->on('booking_mirror')->cascadeOnDelete();
                $table->index('organization_id');
            });
        }

        /* ───── Booking Notes — staff notes on mirror bookings ───── */
        if (!Schema::hasTable('booking_notes')) {
            Schema::create('booking_notes', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('booking_mirror_id');
                $table->string('reservation_id', 30)->index();
                $table->foreignId('staff_id')->nullable()->constrained('staff')->nullOnDelete();
                $table->text('body');
                $table->timestamp('created_at')->useCurrent();

                $table->foreign('booking_mirror_id')->references('id')->on('booking_mirror')->cascadeOnDelete();
                $table->index('organization_id');
            });
        }

        /* ───── Idempotency Keys — prevent duplicate booking submissions ───── */
        if (!Schema::hasTable('booking_idempotency_keys')) {
            Schema::create('booking_idempotency_keys', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('organization_id');
                $table->string('idempotency_key', 128);
                $table->string('request_hash', 64)->nullable();
                $table->jsonb('response_json')->nullable();
                $table->smallInteger('status_code')->nullable();
                $table->timestamp('expires_at');
                $table->timestamps();

                $table->unique(['organization_id', 'idempotency_key']);
                $table->index('organization_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_notes');
        Schema::dropIfExists('booking_price_elements');
        Schema::dropIfExists('booking_idempotency_keys');
        Schema::dropIfExists('booking_submissions');
        Schema::dropIfExists('booking_holds');
        Schema::dropIfExists('booking_mirror');
    }
};
