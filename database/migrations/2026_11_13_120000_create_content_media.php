<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('mime', 100);
            $table->unsignedBigInteger('size');
            $table->text('url');
            $table->boolean('archived')->default(false);
            $table->timestamps();
            $table->index(['organization_id', 'brand_id', 'archived']);
        });
        Schema::create('content_post_media', function (Blueprint $table) {
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->foreignId('media_id')->constrained('content_media')->restrictOnDelete();
            $table->unsignedSmallInteger('position');
            $table->primary(['post_id', 'media_id']);
            $table->unique(['post_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_post_media');
        Schema::dropIfExists('content_media');
    }
};
