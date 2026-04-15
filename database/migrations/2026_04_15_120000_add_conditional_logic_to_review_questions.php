<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds conditional show/hide support to review form questions.
 *
 * Questions are replace-all on save, so referencing by FK would break on
 * every edit. We reference the dependency by its `order` position within
 * the form instead — stable across the replace-all flow and intuitive
 * ("show this question only if the answer to Q3 was X").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('review_form_questions', function (Blueprint $t) {
            // Zero-based index of the question this one depends on.
            $t->integer('condition_index')->nullable()->after('weight');
            // Comparison operator: eq | neq | gte | lte | contains | any_of
            $t->string('condition_operator', 20)->nullable()->after('condition_index');
            // Value(s) to compare against — stored as JSON so it supports
            // strings, numbers, and arrays (for any_of).
            $t->text('condition_value')->nullable()->after('condition_operator');
        });
    }

    public function down(): void
    {
        Schema::table('review_form_questions', function (Blueprint $t) {
            $t->dropColumn(['condition_index', 'condition_operator', 'condition_value']);
        });
    }
};
