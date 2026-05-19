<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('scheduled_command_runs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('command', 191);
            $table->string('expression', 64)->nullable();
            $table->string('status', 16); // success | failed | skipped
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('output_excerpt')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['command', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduled_command_runs');
    }
};
