<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('special_offers', function (Blueprint $t) {
            $t->string('audience', 16)->default('programme');
            $t->unsignedBigInteger('voucher_file_id')->nullable();
        });
        Schema::create('special_offer_recipients', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('offer_id')->constrained('special_offers')->cascadeOnDelete();
            $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $t->unique(['offer_id', 'member_id']);
        });
        Schema::create('special_offer_files', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('offer_id')->unique()->constrained('special_offers')->cascadeOnDelete();
            $t->string('name');
            $t->string('mime', 64);
            $t->unsignedInteger('bytes');
            $t->string('sha256', 64);
            $t->longText('content');
            $t->timestamps();
        });
        Schema::create('special_offer_sends', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('offer_id')->nullable()->constrained('special_offers')->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('idempotency_key', 80);
            $t->string('payload_hash', 64);
            $t->json('member_ids');
            $t->json('portal_ids');
            $t->json('counts');
            $t->boolean('portal_done')->default(false);
            $t->unsignedBigInteger('campaign_id')->nullable();
            $t->json('snapshot');
            $t->longText('attachment_content')->nullable();
            $t->timestamps();
            $t->unique(['organization_id', 'idempotency_key'], 'offer_send_key_unique');
        });
        Schema::table('email_campaigns', fn (Blueprint $t) => $t->unsignedBigInteger('offer_send_id')->nullable());
    }

    public function down(): void
    {
        Schema::table('email_campaigns', fn (Blueprint $t) => $t->dropColumn('offer_send_id'));
        Schema::dropIfExists('special_offer_sends');
        Schema::dropIfExists('special_offer_files');
        Schema::dropIfExists('special_offer_recipients');
        Schema::table('special_offers', fn (Blueprint $t) => $t->dropColumn(['audience', 'voucher_file_id']));
    }
};
