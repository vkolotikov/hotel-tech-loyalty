<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_card_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('first_number', 24);
            $table->string('last_number', 24);
            $table->unsignedSmallInteger('card_count');
            $table->timestamps();
            $table->unique(['organization_id', 'first_number', 'last_number'], 'loyalty_card_batch_range_unique');
        });

        Schema::table('nfc_cards', function (Blueprint $table) {
            // A printed card can be prepared before the tag is read or the recipient is known.
            $table->unsignedBigInteger('member_id')->nullable()->change();
            $table->string('uid', 50)->nullable()->change();
            $table->foreignId('card_batch_id')->nullable()->constrained('loyalty_card_batches')->cascadeOnDelete();
            $table->string('printed_number', 24)->nullable();
            $table->string('printed_qr_token', 32)->nullable()->unique();
            $table->unique(['organization_id', 'printed_number'], 'nfc_cards_org_printed_number_unique');
            $table->index(['card_batch_id', 'id']);
        });
    }

    public function down(): void
    {
        if (DB::table('loyalty_card_batches')->exists()) {
            throw new RuntimeException('Printed card batches exist. This migration cannot be rolled back without losing their identities.');
        }

        Schema::table('nfc_cards', function (Blueprint $table) {
            $table->dropConstrainedForeignId('card_batch_id');
            $table->dropUnique('nfc_cards_org_printed_number_unique');
            $table->dropUnique(['printed_qr_token']);
            $table->dropColumn(['printed_number', 'printed_qr_token']);
            $table->unsignedBigInteger('member_id')->nullable(false)->change();
            $table->string('uid', 50)->nullable(false)->change();
        });

        Schema::dropIfExists('loyalty_card_batches');
    }
};
