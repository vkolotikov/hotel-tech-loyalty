<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('campaign_id')->constrained('notification_campaigns')->cascadeOnDelete();
            $table->foreignId('loyalty_member_id')->nullable()->constrained()->nullOnDelete();
            $table->string('channel', 10); // push | email
            $table->string('email')->nullable();
            $table->string('status', 20)->default('sent'); // sent | failed
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('opened_at')->nullable();
            $table->unsignedInteger('open_count')->default(0);
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['campaign_id', 'channel']);
            $table->index(['campaign_id', 'opened_at']);
            $table->index('loyalty_member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_recipients');
    }
};
