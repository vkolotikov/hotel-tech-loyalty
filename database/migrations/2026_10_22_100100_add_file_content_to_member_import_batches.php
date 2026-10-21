<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Loyalty release 3 (spec 2026-10-22 §2, R3-1): a member import's uploaded CSV is kept in the database between
 * the preview and the last chunk, not on the local disk, which Laravel Cloud loses on a deploy and does not share
 * between replicas (a chunk on another replica found no file).
 *
 * `file_content` is the file's raw bytes, gzip-compressed, then base64 (App\Models\MemberImportBatch::encodeFile): the
 * parser still sees the bytes as uploaded (BOM, delimiter, any encoding), and the column holds only ASCII, which a
 * PostgreSQL `text` column accepts whatever the file's encoding. An upload is at most 20 MB; `longText` is `text` on
 * PostgreSQL. Cleared when the batch ends. A nullable column only, nothing rewritten: safe for `migrate --force` on the
 * live database. `stored_path` stays for batches previewed before this release.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('member_import_batches', 'file_content')) {
            return;
        }
        Schema::table('member_import_batches', function (Blueprint $table) {
            $table->longText('file_content')->nullable();
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('member_import_batches', 'file_content')) {
            return;
        }
        Schema::table('member_import_batches', function (Blueprint $table) {
            $table->dropColumn('file_content');
        });
    }
};
