<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nfc_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('uid', 50)->unique(); // NFC card UID
            $table->string('card_type', 50)->default('NTAG215');
            $table->timestamp('issued_at')->useCurrent();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_scanned_at')->nullable();
            $table->foreignId('last_scanned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->integer('scan_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('member_id');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nfc_cards');
    }
};
