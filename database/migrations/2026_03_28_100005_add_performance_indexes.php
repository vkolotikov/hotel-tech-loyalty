<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->addIndexSafe('inquiries', 'created_at');
        $this->addIndexSafe('inquiries', 'property_id');
        $this->addCompositeIndexSafe('inquiries', ['next_task_completed', 'next_task_due']);

        $this->addIndexSafe('reservations', 'created_at');
        $this->addIndexSafe('reservations', 'booking_channel');
        $this->addIndexSafe('reservations', 'payment_status');

        $this->addIndexSafe('guests', 'created_at');
        $this->addIndexSafe('guests', 'nationality');

        $this->addIndexSafe('loyalty_members', 'joined_at');
        $this->addIndexSafe('loyalty_members', 'current_points');
        $this->addIndexSafe('loyalty_members', 'lifetime_points');
        $this->addCompositeIndexSafe('loyalty_members', ['is_active', 'last_activity_at']);

        $this->addCompositeIndexSafe('points_transactions', ['is_reversed', 'created_at', 'type'], 'pt_reversed_created_type_index');
    }

    public function down(): void
    {
        // Only drop indexes that exist
        $this->dropIndexSafe('inquiries', ['created_at']);
        $this->dropIndexSafe('inquiries', ['property_id']);
        $this->dropIndexSafe('inquiries', ['next_task_completed', 'next_task_due']);
        $this->dropIndexSafe('reservations', ['created_at']);
        $this->dropIndexSafe('reservations', ['booking_channel']);
        $this->dropIndexSafe('reservations', ['payment_status']);
        $this->dropIndexSafe('guests', ['created_at']);
        $this->dropIndexSafe('guests', ['nationality']);
        $this->dropIndexSafe('loyalty_members', ['joined_at']);
        $this->dropIndexSafe('loyalty_members', ['current_points']);
        $this->dropIndexSafe('loyalty_members', ['lifetime_points']);
        $this->dropIndexSafe('loyalty_members', ['is_active', 'last_activity_at']);
        $this->dropNamedIndexSafe('points_transactions', 'pt_reversed_created_type_index');
    }

    private function addIndexSafe(string $table, string $column): void
    {
        if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) return;
        try {
            Schema::table($table, fn(Blueprint $t) => $t->index($column));
        } catch (\Throwable) {
            // Index likely already exists
        }
    }

    private function addCompositeIndexSafe(string $table, array $columns, ?string $name = null): void
    {
        if (!Schema::hasTable($table)) return;
        foreach ($columns as $col) {
            if (!Schema::hasColumn($table, $col)) return;
        }
        try {
            Schema::table($table, fn(Blueprint $t) => $name ? $t->index($columns, $name) : $t->index($columns));
        } catch (\Throwable) {
            // Index likely already exists
        }
    }

    private function dropIndexSafe(string $table, array $columns): void
    {
        try {
            Schema::table($table, fn(Blueprint $t) => $t->dropIndex($columns));
        } catch (\Throwable) {}
    }

    private function dropNamedIndexSafe(string $table, string $name): void
    {
        try {
            Schema::table($table, fn(Blueprint $t) => $t->dropIndex($name));
        } catch (\Throwable) {}
    }
};
