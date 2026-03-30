<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Inquiries — add missing indexes (status & inquiry_type already exist)
        Schema::table('inquiries', function (Blueprint $table) {
            $table->index('created_at');
            $table->index('property_id');
            $table->index(['next_task_completed', 'next_task_due']);
        });

        // Reservations — add missing indexes (check_out & status already exist)
        Schema::table('reservations', function (Blueprint $table) {
            $table->index('created_at');
            $table->index('booking_channel');
            $table->index('payment_status');
        });

        // Guests — add missing indexes (vip_level already exists)
        Schema::table('guests', function (Blueprint $table) {
            $table->index('created_at');
            $table->index('nationality');
        });

        // Loyalty members — queried by is_active + last_activity, joined_at, current_points
        Schema::table('loyalty_members', function (Blueprint $table) {
            $table->index('joined_at');
            $table->index('current_points');
            $table->index('lifetime_points');
            $table->index(['is_active', 'last_activity_at']);
        });

        // Points transactions — composite index for the common aggregation pattern
        Schema::table('points_transactions', function (Blueprint $table) {
            $table->index(['is_reversed', 'created_at', 'type'], 'pt_reversed_created_type_index');
        });
    }

    public function down(): void
    {
        Schema::table('inquiries', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['property_id']);
            $table->dropIndex(['next_task_completed', 'next_task_due']);
        });

        Schema::table('reservations', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['booking_channel']);
            $table->dropIndex(['payment_status']);
        });

        Schema::table('guests', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['nationality']);
        });

        Schema::table('loyalty_members', function (Blueprint $table) {
            $table->dropIndex(['joined_at']);
            $table->dropIndex(['current_points']);
            $table->dropIndex(['lifetime_points']);
            $table->dropIndex(['is_active', 'last_activity_at']);
        });

        Schema::table('points_transactions', function (Blueprint $table) {
            $table->dropIndex('pt_reversed_created_type_index');
        });
    }
};
