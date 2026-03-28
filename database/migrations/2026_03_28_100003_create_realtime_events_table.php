<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('realtime_events', function (Blueprint $table) {
            $table->id();
            $table->string('type', 50);         // arrival, departure, inquiry, points, member, reservation
            $table->string('title', 255);
            $table->text('body')->nullable();
            $table->json('data')->nullable();     // arbitrary payload (guest name, amount, etc.)
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('realtime_events');
    }
};
