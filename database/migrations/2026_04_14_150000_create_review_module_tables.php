<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('review_forms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type', 20); // basic | custom
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->json('config')->nullable();
            // Per-org embed key — one form can be embedded via iframe. Keys are
            // stored here rather than per-form so rotating is simple; the front
            // controller still resolves the form by id+key pair.
            $table->string('embed_key', 64)->nullable()->index();
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
        });

        Schema::create('review_form_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('form_id')->constrained('review_forms')->cascadeOnDelete();
            $table->unsignedInteger('order')->default(0);
            $table->string('kind', 20); // text | textarea | stars | scale | nps | single_choice | multi_choice | boolean
            $table->string('label');
            $table->text('help_text')->nullable();
            $table->json('options')->nullable();
            $table->boolean('required')->default(false);
            $table->unsignedTinyInteger('weight')->default(1);
            $table->timestamps();

            $table->index(['form_id', 'order']);
        });

        Schema::create('review_integrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 30); // google | trustpilot | tripadvisor | facebook
            $table->string('display_name')->nullable();
            $table->string('write_review_url', 1024);
            $table->string('place_id')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->unique(['organization_id', 'platform']);
        });

        Schema::create('review_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('form_id')->constrained('review_forms')->cascadeOnDelete();
            $table->foreignId('guest_id')->nullable()->constrained('guests')->nullOnDelete();
            $table->foreignId('loyalty_member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->string('token', 64)->unique();
            $table->string('channel', 20)->default('link'); // email | push | sms | qr | link
            $table->string('status', 20)->default('pending'); // pending | opened | submitted | redirected | expired
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->json('metadata')->nullable(); // {booking_id, reservation_id, triggered_by}
            $table->timestamps();

            $table->index(['form_id', 'status']);
            $table->index(['organization_id', 'status']);
        });

        Schema::create('review_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('form_id')->constrained('review_forms')->cascadeOnDelete();
            $table->foreignId('invitation_id')->nullable()->constrained('review_invitations')->nullOnDelete();
            $table->foreignId('guest_id')->nullable()->constrained('guests')->nullOnDelete();
            $table->foreignId('loyalty_member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->unsignedTinyInteger('overall_rating')->nullable(); // 1-5, denormalized
            $table->unsignedTinyInteger('nps_score')->nullable();      // 0-10, denormalized
            $table->json('answers')->nullable();                        // {question_id: value}
            $table->text('comment')->nullable();
            $table->boolean('redirected_externally')->default(false);
            $table->string('external_platform', 30)->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('anonymous_name')->nullable();
            $table->string('anonymous_email')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'submitted_at']);
            $table->index(['form_id', 'overall_rating']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('review_submissions');
        Schema::dropIfExists('review_invitations');
        Schema::dropIfExists('review_integrations');
        Schema::dropIfExists('review_form_questions');
        Schema::dropIfExists('review_forms');
    }
};
