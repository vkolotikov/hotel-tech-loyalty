<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attachments on inquiries — proposals, signed BEOs, contracts, ID scans,
 * invoice PDFs, anything staff need to keep with the deal.
 *
 * org_id is denormalised so we can apply the TenantScope global scope on
 * the model directly without joining inquiries; deletes cascade so an
 * inquiry being removed cleans up its attachments automatically.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inquiry_attachments', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('organization_id')->index();
            $t->foreignId('inquiry_id')->constrained('inquiries')->cascadeOnDelete();
            $t->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('filename', 255);     // original filename for display
            $t->string('url', 1024);         // storage URL (relative /storage/... or CDN absolute)
            $t->string('mime_type', 100)->nullable();
            $t->unsignedBigInteger('size_bytes')->nullable();
            $t->text('note')->nullable();    // optional context: "signed contract", "rev 2", etc.
            $t->timestamps();

            $t->index(['inquiry_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inquiry_attachments');
    }
};
