<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /* ───── Guests (CRM profiles — may or may not be loyalty members) ───── */
        Schema::create('guests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->string('salutation', 20)->nullable();
            $table->string('first_name', 100)->nullable();
            $table->string('last_name', 100)->nullable();
            $table->string('full_name', 200);
            $table->string('email', 150)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('mobile', 50)->nullable();
            $table->string('company', 200)->nullable();
            $table->string('position_title', 100)->nullable();
            $table->string('guest_type', 30)->default('Individual');
            $table->string('nationality', 100)->nullable();
            $table->string('country', 100)->nullable();
            $table->string('city', 100)->nullable();
            $table->text('address')->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('passport_no', 50)->nullable();
            $table->string('id_number', 50)->nullable();
            $table->string('vip_level', 30)->default('Standard');
            $table->string('loyalty_tier', 30)->nullable();
            $table->string('loyalty_id', 50)->nullable();
            $table->string('preferred_language', 30)->nullable();
            $table->string('preferred_room_type', 100)->nullable();
            $table->string('preferred_floor', 20)->nullable();
            $table->text('dietary_preferences')->nullable();
            $table->text('special_needs')->nullable();
            $table->boolean('email_consent')->default(false);
            $table->boolean('marketing_consent')->default(false);
            $table->timestamp('consent_updated_at')->nullable();
            $table->string('lead_source', 100)->nullable();
            $table->string('owner_name', 150)->nullable();
            $table->string('lifecycle_status', 50)->default('Prospect');
            $table->string('importance', 30)->default('Standard');
            $table->integer('total_stays')->default(0);
            $table->integer('total_nights')->default(0);
            $table->decimal('total_revenue', 12, 2)->default(0);
            $table->decimal('avg_daily_rate', 10, 2)->nullable();
            $table->date('first_stay_date')->nullable();
            $table->date('last_stay_date')->nullable();
            $table->timestamp('last_activity_at')->nullable();
            $table->string('external_source', 50)->nullable();
            $table->string('external_ref', 100)->nullable();
            $table->string('email_key', 150)->nullable();
            $table->string('phone_key', 50)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index('email_key');
            $table->index('phone_key');
            $table->index('vip_level');
            $table->index('guest_type');
            $table->index('member_id');
        });

        /* ───── Corporate Accounts ───── */
        Schema::create('corporate_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('company_name', 200);
            $table->string('industry', 100)->nullable();
            $table->string('tax_id', 50)->nullable();
            $table->text('billing_address')->nullable();
            $table->string('billing_email', 150)->nullable();
            $table->string('contact_person', 150)->nullable();
            $table->string('contact_email', 150)->nullable();
            $table->string('contact_phone', 50)->nullable();
            $table->string('account_manager', 150)->nullable();
            $table->date('contract_start')->nullable();
            $table->date('contract_end')->nullable();
            $table->decimal('negotiated_rate', 10, 2)->nullable();
            $table->string('rate_type', 30)->nullable();
            $table->decimal('discount_percentage', 5, 2)->nullable();
            $table->integer('annual_room_nights_target')->nullable();
            $table->integer('annual_room_nights_actual')->default(0);
            $table->decimal('annual_revenue', 12, 2)->default(0);
            $table->string('payment_terms', 50)->default('Net 30');
            $table->decimal('credit_limit', 12, 2)->nullable();
            $table->string('status', 30)->default('Active');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        /* ───── Inquiries (sales pipeline) ───── */
        Schema::create('inquiries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_id')->constrained('guests')->cascadeOnDelete();
            $table->foreignId('corporate_account_id')->nullable()->constrained('corporate_accounts')->nullOnDelete();
            $table->foreignId('property_id')->nullable()->constrained('properties')->nullOnDelete();
            $table->string('inquiry_type', 50)->default('Room Reservation');
            $table->string('source', 100)->nullable();
            $table->date('check_in')->nullable();
            $table->date('check_out')->nullable();
            $table->integer('num_nights')->nullable();
            $table->integer('num_rooms')->default(1);
            $table->integer('num_adults')->default(1);
            $table->integer('num_children')->default(0);
            $table->string('room_type_requested', 100)->nullable();
            $table->decimal('rate_offered', 10, 2)->nullable();
            $table->decimal('total_value', 12, 2)->nullable();
            $table->string('status', 50)->default('New');
            $table->string('priority', 20)->default('Medium');
            $table->string('assigned_to', 150)->nullable();
            $table->text('special_requests')->nullable();
            $table->string('event_type', 100)->nullable();
            $table->string('event_name', 200)->nullable();
            $table->integer('event_pax')->nullable();
            $table->string('function_space', 100)->nullable();
            $table->boolean('catering_required')->default(false);
            $table->boolean('av_required')->default(false);
            $table->string('next_task_type', 50)->nullable();
            $table->date('next_task_due')->nullable();
            $table->text('next_task_notes')->nullable();
            $table->boolean('next_task_completed')->default(false);
            $table->integer('phone_calls_made')->default(0);
            $table->integer('emails_sent')->default(0);
            $table->date('last_contacted_at')->nullable();
            $table->text('last_contact_comment')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index('status');
            $table->index('inquiry_type');
            $table->index('check_in');
        });

        /* ───── Reservations (CRM bookings with full lifecycle) ───── */
        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_id')->constrained('guests')->cascadeOnDelete();
            $table->foreignId('inquiry_id')->nullable()->constrained('inquiries')->nullOnDelete();
            $table->foreignId('corporate_account_id')->nullable()->constrained('corporate_accounts')->nullOnDelete();
            $table->foreignId('property_id')->constrained('properties');
            $table->string('confirmation_no', 50)->nullable()->unique();
            $table->date('check_in');
            $table->date('check_out');
            $table->integer('num_nights')->nullable();
            $table->integer('num_rooms')->default(1);
            $table->integer('num_adults')->default(1);
            $table->integer('num_children')->default(0);
            $table->string('room_type', 100)->nullable();
            $table->string('room_number', 20)->nullable();
            $table->decimal('rate_per_night', 10, 2)->nullable();
            $table->decimal('total_amount', 12, 2)->nullable();
            $table->string('meal_plan', 50)->default('Bed & Breakfast');
            $table->string('payment_status', 30)->default('Pending');
            $table->string('payment_method', 50)->nullable();
            $table->string('booking_channel', 50)->nullable();
            $table->string('agent_name', 150)->nullable();
            $table->string('status', 30)->default('Confirmed');
            $table->string('source', 100)->nullable();
            $table->time('arrival_time')->nullable();
            $table->time('departure_time')->nullable();
            $table->text('special_requests')->nullable();
            $table->string('task_type', 50)->nullable();
            $table->date('task_due')->nullable();
            $table->string('task_urgency', 20)->nullable();
            $table->text('task_notes')->nullable();
            $table->boolean('task_completed')->default(false);
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('checked_out_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index('status');
            $table->index('check_in');
            $table->index('check_out');
        });

        /* ───── Guest Tags ───── */
        Schema::create('guest_tags', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80)->unique();
            $table->string('color', 7)->default('#D4AF37');
            $table->timestamps();
        });

        Schema::create('guest_tag_links', function (Blueprint $table) {
            $table->foreignId('guest_id')->constrained('guests')->cascadeOnDelete();
            $table->foreignId('tag_id')->constrained('guest_tags')->cascadeOnDelete();
            $table->timestamp('created_at')->nullable();
            $table->primary(['guest_id', 'tag_id']);
        });

        /* ───── Guest Segments ───── */
        Schema::create('guest_segments', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->json('filters');
            $table->timestamps();
        });

        /* ───── Guest Activities ───── */
        Schema::create('guest_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_id')->constrained('guests')->cascadeOnDelete();
            $table->string('type', 50);
            $table->text('description');
            $table->string('performed_by', 150)->nullable();
            $table->timestamps();
        });

        /* ───── Guest Custom Fields ───── */
        Schema::create('guest_custom_fields', function (Blueprint $table) {
            $table->id();
            $table->string('field_name', 100);
            $table->string('field_type', 20)->default('text');
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('guest_custom_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_id')->constrained('guests')->cascadeOnDelete();
            $table->foreignId('field_id')->constrained('guest_custom_fields')->cascadeOnDelete();
            $table->text('value')->nullable();
            $table->timestamps();
        });

        /* ───── Guest Import Runs ───── */
        Schema::create('guest_import_runs', function (Blueprint $table) {
            $table->id();
            $table->integer('total_rows')->default(0);
            $table->integer('created_count')->default(0);
            $table->integer('updated_count')->default(0);
            $table->integer('skipped_count')->default(0);
            $table->json('errors')->nullable();
            $table->string('performed_by', 150)->nullable();
            $table->timestamps();
        });

        /* ───── Planner ───── */
        Schema::create('planner_tasks', function (Blueprint $table) {
            $table->id();
            $table->string('employee_name', 150)->nullable();
            $table->string('title', 200);
            $table->date('task_date');
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->string('status', 20)->default('Pending');
            $table->string('priority', 10)->default('Medium');
            $table->string('task_group', 80)->nullable();
            $table->string('task_category', 120)->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->boolean('completed')->default(false);
            $table->text('description')->nullable();
            $table->timestamps();
            $table->index('task_date');
            $table->index('employee_name');
        });

        Schema::create('planner_subtasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('planner_tasks')->cascadeOnDelete();
            $table->string('title', 200);
            $table->boolean('is_done')->default(false);
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('planner_day_notes', function (Blueprint $table) {
            $table->id();
            $table->date('note_date')->unique();
            $table->text('note_text')->nullable();
            $table->timestamps();
        });

        /* ───── Venues ───── */
        Schema::create('venues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties');
            $table->string('name');
            $table->string('venue_type');
            $table->integer('capacity')->nullable();
            $table->decimal('hourly_rate', 10, 2)->nullable();
            $table->decimal('half_day_rate', 10, 2)->nullable();
            $table->decimal('full_day_rate', 10, 2)->nullable();
            $table->jsonb('amenities')->nullable();
            $table->string('floor')->nullable();
            $table->integer('area_sqm')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('venue_bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venue_id')->constrained('venues');
            $table->foreignId('guest_id')->nullable()->constrained('guests');
            $table->foreignId('corporate_account_id')->nullable()->constrained('corporate_accounts');
            $table->date('booking_date');
            $table->time('start_time');
            $table->time('end_time');
            $table->string('event_name')->nullable();
            $table->string('event_type')->nullable();
            $table->integer('attendees')->nullable();
            $table->string('setup_style')->nullable();
            $table->boolean('catering_required')->default(false);
            $table->boolean('av_required')->default(false);
            $table->text('special_requirements')->nullable();
            $table->string('contact_name')->nullable();
            $table->string('contact_phone')->nullable();
            $table->string('contact_email')->nullable();
            $table->decimal('rate_charged', 10, 2)->nullable();
            $table->string('status')->default('Confirmed');
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('venue_bookings');
        Schema::dropIfExists('venues');
        Schema::dropIfExists('planner_day_notes');
        Schema::dropIfExists('planner_subtasks');
        Schema::dropIfExists('planner_tasks');
        Schema::dropIfExists('guest_import_runs');
        Schema::dropIfExists('guest_custom_values');
        Schema::dropIfExists('guest_custom_fields');
        Schema::dropIfExists('guest_activities');
        Schema::dropIfExists('guest_segments');
        Schema::dropIfExists('guest_tag_links');
        Schema::dropIfExists('guest_tags');
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('inquiries');
        Schema::dropIfExists('corporate_accounts');
        Schema::dropIfExists('guests');
    }
};
