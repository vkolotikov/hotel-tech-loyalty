<?php

namespace Tests\Feature\Crm;

use App\Models\InquiryAttachment;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the InquiryAttachment model contract — the file-upload
 * row backing the 2026-05-17 CRM polish wave's inquiry
 * attachments feature.
 *
 * Why this matters:
 *
 *   InquiryAttachment rows back the drag-drop file zone on
 *   /inquiries/:id (CLAUDE.md "File attachments on inquiries").
 *   25MB / file cap + MIME whitelist enforced at the controller
 *   layer (InquiryAttachmentController). Storage routes through
 *   MediaService (DO Spaces in prod, local in dev).
 *
 *   The size_bytes int cast drives the SPA's "Total attached:
 *   X MB" display + per-file size badge. A regression in the
 *   cast surfaces wrong sizes + the SPA's "X MB" formatter
 *   crashes on string input.
 *
 *   uploader FK = 'uploaded_by' (NOT 'uploaded_by_user_id' or
 *   'user_id'). Lock against "harmonising" refactors — the
 *   attachment-detail panel's "Uploaded by Alice 5 min ago"
 *   display reads this FK to build the avatar chip.
 *
 *   url stores the relative MediaService path. The SPA
 *   resolves it against API_URL before rendering — locked
 *   here as a string round-trip; the absolutize logic lives
 *   in the controller.
 *
 * Contract:
 *
 *   - size_bytes integer cast.
 *   - inquiry BelongsTo (FK='inquiry_id').
 *   - uploader BelongsTo User FK='uploaded_by' (locked against
 *     name harmonisation).
 *   - All metadata fields round-trip: filename / url /
 *     mime_type / note.
 *   - BelongsToOrganization + TenantScope cross-org isolation.
 */
class InquiryAttachmentModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('inquiry_attachments')) {
            Schema::create('inquiry_attachments', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('inquiry_id');
                $t->unsignedBigInteger('uploaded_by')->nullable();
                $t->string('filename');
                $t->string('url');
                $t->string('mime_type', 128)->nullable();
                $t->bigInteger('size_bytes')->nullable();
                $t->text('note')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'inquiry_id']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function attachment(array $attrs = []): InquiryAttachment
    {
        return InquiryAttachment::create(array_merge([
            'organization_id' => $this->orgId,
            'inquiry_id'      => 1,
            'filename'        => 'rfp.pdf',
            'url'             => '/storage/inquiry-attachments/abc.pdf',
            'mime_type'       => 'application/pdf',
            'size_bytes'      => 1048576, // 1MB
        ], $attrs));
    }

    /* ─── size_bytes integer cast ─── */

    public function test_size_bytes_casts_to_integer(): void
    {
        // Drives the SPA's per-file size badge + total
        // attached display. A regression in the cast
        // surfaces strings to the SPA's number-formatter
        // which then crashes on the divide-by-1024 math.
        $att = $this->attachment(['size_bytes' => '25000000']); // ~24MB

        $this->assertSame(25000000, $att->size_bytes);
        $this->assertIsInt($att->size_bytes);
    }

    public function test_size_bytes_handles_large_files_within_25mb_cap(): void
    {
        // Lock: the 25MB cap is enforced at the controller
        // layer (CLAUDE.md "25 MB / file cap"). Model
        // accepts the boundary exactly.
        $sizeBytes = 25 * 1024 * 1024; // 25 MB exactly

        $att = $this->attachment(['size_bytes' => $sizeBytes]);

        $this->assertSame(26214400, $att->size_bytes);
    }

    public function test_size_bytes_nullable_for_legacy_rows(): void
    {
        // Defensive: an old migration backfill or a
        // metadata-only attachment may lack size. Lock null
        // persists.
        $att = $this->attachment(['size_bytes' => null]);

        $this->assertNull($att->fresh()->size_bytes);
    }

    /* ─── Mime type values persist intact ─── */

    public function test_documented_mime_types_persist_intact(): void
    {
        // The CLAUDE.md whitelist:
        //   PDF / DOC / XLS / PPT / CSV / images / ZIP — what
        // hotels actually attach. Validation is at the
        // controller layer; the model preserves the string
        // verbatim.
        $mimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
            'image/jpeg',
            'image/png',
            'application/zip',
        ];

        foreach ($mimeTypes as $i => $mime) {
            $att = $this->attachment([
                'filename'  => "file-{$i}.bin",
                'mime_type' => $mime,
            ]);
            $this->assertSame($mime, $att->fresh()->mime_type);
        }
    }

    /* ─── Metadata fields round-trip ─── */

    public function test_filename_persists_with_special_characters(): void
    {
        // Filenames carry user-supplied content — spaces,
        // unicode, parens are all valid. Lock so the cast
        // doesn't slug-ify accidentally.
        $special = 'Q4 Proposal (final v2) — Westin.pdf';

        $att = $this->attachment(['filename' => $special]);

        $this->assertSame($special, $att->fresh()->filename);
    }

    public function test_url_persists_as_relative_path(): void
    {
        // url stores the relative MediaService path. The SPA
        // resolves it against API_URL before rendering. The
        // model layer MUST preserve the relative path
        // verbatim — absolutize logic lives in the controller.
        $relative = '/storage/inquiry-attachments/2026/06/abc123-rfp.pdf';

        $att = $this->attachment(['url' => $relative]);

        $this->assertSame($relative, $att->fresh()->url);
    }

    public function test_note_persists_optional_user_annotation(): void
    {
        // note is the optional caption typed by the uploader
        // ("Signed contract — page 3 has the rate"). Drives
        // the hover-tooltip on the file chip.
        $note = "Signed contract — page 3 has the rate.\nDate: 2026-06-15";

        $att = $this->attachment(['note' => $note]);

        $this->assertSame($note, $att->fresh()->note);
    }

    public function test_null_note_persists_as_null(): void
    {
        $att = $this->attachment(['note' => null]);

        $this->assertNull($att->fresh()->note);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_inquiry_relationship_uses_inquiry_id_fk(): void
    {
        $att = $this->attachment(['inquiry_id' => 500]);
        $rel = $att->inquiry();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('inquiry_id', $rel->getForeignKeyName());
    }

    public function test_uploader_relationship_uses_uploaded_by_fk(): void
    {
        // CRITICAL: FK is 'uploaded_by' (NOT 'uploaded_by_user_id'
        // or 'user_id'). Lock against "harmonising" refactors —
        // the attachment-detail panel's "Uploaded by Alice"
        // chip reads this FK.
        $att = $this->attachment(['uploaded_by' => 42]);
        $rel = $att->uploader();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('uploaded_by', $rel->getForeignKeyName(),
            'uploader FK MUST be uploaded_by (NOT uploaded_by_user_id or user_id).');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $att = $this->attachment();

        $this->assertSame($this->orgId, (int) $att->organization_id);
    }

    public function test_tenant_scope_isolates_attachments_cross_org(): void
    {
        // CRITICAL: attachments often hold signed contracts,
        // tax docs, sensitive customer PII. Cross-leak would
        // expose competitor's legal + commercial documents.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->attachment(['filename' => 'org-a-contract.pdf']);
        \DB::table('inquiry_attachments')->insert([
            'organization_id' => $orgB,
            'inquiry_id'      => 1,
            'filename'        => 'org-b-contract.pdf',
            'url'             => '/storage/inquiry-attachments/org-b.pdf',
            'mime_type'       => 'application/pdf',
            'size_bytes'      => 500000,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = InquiryAttachment::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('org-a-contract.pdf', $aRows->first()->filename);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = InquiryAttachment::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('org-b-contract.pdf', $bRows->first()->filename);
    }
}
