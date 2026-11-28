<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A task's priority and length are its own columns (2026-11-09, the task form redesigned for HexaTech CRM and the full
 * admin). The full admin's drawer had sent them, and the repeat, inside `custom_data`, which keeps only an
 * organisation's own defined custom fields (CustomFieldService::validate), so they were never saved. Both nullable: an
 * existing row reads as "normal priority, no length". The repeat uses the column the table already had,
 * `recurring_rule`.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('tasks')) {
            return;
        }

        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'priority')) {
                $table->string('priority', 10)->nullable();
            }
            if (!Schema::hasColumn('tasks', 'duration_minutes')) {
                $table->unsignedSmallInteger('duration_minutes')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('tasks')) {
            return;
        }

        Schema::table('tasks', function (Blueprint $table) {
            foreach (['priority', 'duration_minutes'] as $column) {
                if (Schema::hasColumn('tasks', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
