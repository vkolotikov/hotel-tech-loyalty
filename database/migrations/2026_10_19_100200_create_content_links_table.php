<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Content's tracked links (spec 2026-10-19 §5, §7.1): a post's Link or a link-in-bio button as a short code on
 * the public host. `destination` null = the code is switched off (the Link was cleared, the button removed); the row
 * stays, because the short link may already be out in the world — also when its post is deleted (null on delete).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_links')) {
            return;
        }
        Schema::create('content_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->foreignId('post_id')->nullable()->constrained('content_planner_posts')->nullOnDelete();
            $table->string('code', 7)->unique();
            $table->string('destination', 2000)->nullable();
            $table->json('utm')->nullable();
            $table->timestamps();
            $table->unique('post_id');
            $table->index('brand_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_links');
    }
};
