<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('name');
            $table->string('slug')->nullable();
            $table->text('description')->nullable();
            $table->string('icon')->nullable()->comment('Lucide icon slug, e.g. sparkles, scissors, heart');
            $table->string('image')->nullable();
            $table->string('color', 20)->nullable()->comment('Hex color for category chip');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
        });

        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('category_id')->nullable();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->text('description')->nullable();
            $table->text('short_description')->nullable();
            $table->integer('duration_minutes')->default(60)->comment('Time required to perform the service');
            $table->integer('buffer_after_minutes')->default(0)->comment('Clean-up/reset time after service');
            $table->decimal('price', 10, 2)->default(0);
            $table->string('currency', 10)->default('EUR');
            $table->string('image')->nullable();
            $table->json('gallery')->nullable()->comment('Additional images');
            $table->json('tags')->nullable()->comment('Display tags e.g. ["Signature","Popular"]');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
            $table->index(['organization_id', 'category_id']);
        });

        Schema::create('service_masters', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('user_id')->nullable()->comment('Optional link to a staff user');
            $table->string('name');
            $table->string('title')->nullable()->comment('e.g. "Senior Therapist"');
            $table->text('bio')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('avatar')->nullable();
            $table->json('specialties')->nullable()->comment('Free-text specialties for display');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
        });

        // Many-to-many: which masters perform which services.
        Schema::create('service_master_service', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_master_id');
            $table->unsignedBigInteger('service_id');
            $table->decimal('price_override', 10, 2)->nullable()->comment('Master-specific price, null = use service.price');
            $table->integer('duration_override_minutes')->nullable()->comment('Master-specific duration, null = use service.duration_minutes');
            $table->timestamps();

            $table->unique(['service_master_id', 'service_id']);
            $table->index(['organization_id', 'service_id']);
        });

        // Recurring weekly schedule per master.
        Schema::create('service_master_schedules', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_master_id');
            $table->unsignedTinyInteger('day_of_week')->comment('0=Sunday, 1=Monday, ... 6=Saturday');
            $table->time('start_time');
            $table->time('end_time');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['organization_id', 'service_master_id']);
            $table->index(['service_master_id', 'day_of_week']);
        });

        // One-off exceptions (vacation, sick day, extra shift).
        Schema::create('service_master_time_off', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_master_id');
            $table->date('date');
            $table->time('start_time')->nullable()->comment('NULL = full day off');
            $table->time('end_time')->nullable();
            $table->string('reason')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'service_master_id', 'date']);
        });

        Schema::create('service_extras', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 10, 2)->default(0);
            $table->string('price_type')->default('per_booking')->comment('per_booking, per_person');
            $table->integer('duration_minutes')->default(0)->comment('Extra time to add onto booking');
            $table->string('currency', 10)->default('EUR');
            $table->string('image')->nullable();
            $table->string('icon')->nullable();
            $table->string('category')->nullable()->comment('e.g. aromatherapy, refreshment');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
        });

        Schema::create('service_bookings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('booking_reference', 20)->unique();
            $table->unsignedBigInteger('service_id');
            $table->unsignedBigInteger('service_master_id')->nullable()->comment('Null = "any available master"');
            $table->unsignedBigInteger('guest_id')->nullable()->comment('Optional link to CRM guest');
            $table->unsignedBigInteger('member_id')->nullable()->comment('Optional link to loyalty member');

            // Customer snapshot (captured at booking time, even if guest/member linked later)
            $table->string('customer_name');
            $table->string('customer_email');
            $table->string('customer_phone')->nullable();
            $table->integer('party_size')->default(1);

            $table->dateTime('start_at');
            $table->dateTime('end_at');
            $table->integer('duration_minutes');

            $table->decimal('service_price', 10, 2)->default(0);
            $table->decimal('extras_total', 10, 2)->default(0);
            $table->decimal('total_amount', 10, 2)->default(0);
            $table->string('currency', 10)->default('EUR');

            $table->string('status', 30)->default('pending')
                ->comment('pending, confirmed, in_progress, completed, cancelled, no_show');
            $table->string('payment_status', 30)->default('unpaid')
                ->comment('unpaid, paid, refunded, failed');
            $table->string('stripe_payment_intent_id')->nullable();

            $table->string('source', 30)->default('widget')
                ->comment('widget, admin, phone, walk_in');
            $table->text('customer_notes')->nullable();
            $table->text('staff_notes')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancellation_reason')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status']);
            $table->index(['organization_id', 'start_at']);
            $table->index(['service_master_id', 'start_at']);
            $table->index(['service_id', 'start_at']);
        });

        Schema::create('service_booking_extras', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_booking_id');
            $table->unsignedBigInteger('service_extra_id');
            $table->string('name')->comment('Snapshot of extra name at booking time');
            $table->decimal('unit_price', 10, 2)->default(0);
            $table->integer('quantity')->default(1);
            $table->decimal('line_total', 10, 2)->default(0);
            $table->timestamps();

            $table->index(['organization_id', 'service_booking_id']);
        });

        Schema::create('service_booking_submissions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('idempotency_key', 80)->nullable();
            $table->string('source', 30)->default('widget');
            $table->string('outcome', 30)->default('pending')->comment('success, failed, pending');
            $table->unsignedBigInteger('service_booking_id')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_name')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->string('error_message')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'outcome']);
            $table->index(['organization_id', 'idempotency_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_booking_submissions');
        Schema::dropIfExists('service_booking_extras');
        Schema::dropIfExists('service_bookings');
        Schema::dropIfExists('service_extras');
        Schema::dropIfExists('service_master_time_off');
        Schema::dropIfExists('service_master_schedules');
        Schema::dropIfExists('service_master_service');
        Schema::dropIfExists('service_masters');
        Schema::dropIfExists('services');
        Schema::dropIfExists('service_categories');
    }
};
