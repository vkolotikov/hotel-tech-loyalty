<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_work', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->unsignedBigInteger('requester_id');
            $table->unsignedBigInteger('post_id')->nullable();
            $table->string('action', 20);
            $table->string('request_key', 100);
            $table->json('input');
            $table->string('post_revision', 40)->nullable();
            $table->string('status', 20)->default('queued');
            $table->string('owner', 40)->nullable();
            $table->json('result')->nullable();
            $table->string('error', 60)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'brand_id', 'requester_id', 'request_key'], 'content_work_request_unique');
            $table->index(['organization_id', 'brand_id', 'post_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_work');
    }
};
