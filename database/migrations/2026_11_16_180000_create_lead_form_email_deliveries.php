<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lead_form_email_deliveries')) return;
        Schema::create('lead_form_email_deliveries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_form_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('lead_form_submission_id')->nullable()->constrained()->nullOnDelete();
            $t->string('email', 200);
            $t->string('email_hash', 64);
            $t->string('unsubscribe_token', 48)->unique();
            $t->string('subject');
            $t->text('html_body');
            $t->string('consent_field', 120);
            $t->text('consent_label');
            $t->timestampTz('expires_at');
            $t->string('status', 20)->default('pending');
            $t->timestampTz('attempted_at')->nullable();
            $t->timestampTz('sent_at')->nullable();
            $t->timestampTz('unsubscribed_at')->nullable();
            $t->timestamps();
            $t->unique(['lead_form_id', 'email_hash'], 'lead_form_email_once');
            $t->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_form_email_deliveries');
    }
};
