<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which reviews a venue has chosen to show on its own website.
 *
 * Nothing here decides whether a review is good; it records that a human
 * picked it. Defaults to false so shipping this column publishes nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('review_submissions', function (Blueprint $table) {
            $table->boolean('is_featured')->default(false);
            $table->index(['organization_id', 'is_featured'], 'review_submissions_org_featured_idx');
        });
    }

    public function down(): void
    {
        Schema::table('review_submissions', function (Blueprint $table) {
            $table->dropIndex('review_submissions_org_featured_idx');
            $table->dropColumn('is_featured');
        });
    }
};
