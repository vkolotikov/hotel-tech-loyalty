<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A link-in-bio page's buttons (spec 2026-10-19 §6.2, §7.1): a label and a tracked link each, in `position` order.
 * Removing a button deletes its row and switches its link's code off (the link row stays).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_bio_buttons')) {
            return;
        }
        Schema::create('content_bio_buttons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bio_page_id')->constrained('content_bio_pages')->cascadeOnDelete();
            $table->foreignId('link_id')->constrained('content_links')->cascadeOnDelete();
            $table->string('label', 40);
            $table->smallInteger('position');
            $table->index(['bio_page_id', 'position']);
            $table->index('link_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_bio_buttons');
    }
};
