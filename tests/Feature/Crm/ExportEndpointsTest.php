<?php

namespace Tests\Feature\Crm;

use App\Http\Controllers\Api\V1\Admin\GuestController;
use App\Http\Controllers\Api\V1\Admin\InquiryController;
use App\Models\CustomField;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Services\XlsxWriter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;
use ZipArchive;

/**
 * Locks the leads + customers export contract — the 2026-07 rework
 * that replaced the bare fputcsv() dumps with styled XLSX workbooks.
 *
 * Why this matters: the old inquiries export silently dropped the
 * guest's CONTACT details (no email / phone / mobile column at all)
 * and every custom field — the exact customer complaint that
 * triggered the rework. These tests run the real controller methods
 * end-to-end (query + eager loads + row mapping + workbook assembly)
 * and unzip the result, so a regression in any layer fails here.
 *
 * Full HTTP-layer tests stay blocked on the Postgres test DB (see
 * LeadIntakeApiTest); controllers are resolved from the container
 * and invoked directly, the house pattern for admin endpoints.
 */
class ExportEndpointsTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpGuestMergeSchema();  // rich guests + basic inquiries
        $this->setUpCrmPresetSchema();   // pipelines / stages / lost reasons / custom_fields / brands

        // Columns the export reads that the shared concern's minimal
        // tables don't carry. Guarded per-column so other suites that
        // extended these tables first stay compatible.
        $extraGuestCols = [
            ['guest_type', 'string'], ['loyalty_tier', 'string'],
            ['mobile', 'string'], ['salutation', 'string'],
            ['avg_daily_rate', 'decimal'], ['last_stay_date', 'date'],
            ['email_consent', 'boolean'], ['marketing_consent', 'boolean'],
        ];
        Schema::table('guests', function ($table) use ($extraGuestCols) {
            foreach ($extraGuestCols as [$col, $type]) {
                if (Schema::hasColumn('guests', $col)) continue;
                $def = match ($type) {
                    'decimal' => $table->decimal($col, 12, 2),
                    default   => $table->{$type}($col),
                };
                $def->nullable();
            }
        });

        $extraInquiryCols = [
            ['guest_id', 'unsignedBigInteger'], ['property_id', 'unsignedBigInteger'],
            ['inquiry_type', 'string'], ['source', 'string'],
            ['check_in', 'date'], ['check_out', 'date'],
            ['num_nights', 'integer'], ['num_rooms', 'integer'],
            ['num_adults', 'integer'], ['num_children', 'integer'],
            ['room_type_requested', 'string'], ['rate_offered', 'decimal'],
            ['total_value', 'decimal'], ['priority', 'string'],
            ['assigned_to', 'string'], ['special_requests', 'text'],
            ['event_type', 'string'], ['event_name', 'string'],
            ['event_pax', 'integer'], ['next_task_due', 'date'],
            ['next_task_completed', 'boolean'], ['last_contacted_at', 'date'],
            ['notes', 'text'], ['custom_data', 'text'],
            ['payment_status', 'string'], ['paid_amount', 'decimal'],
            ['currency', 'string'],
        ];
        Schema::table('inquiries', function ($table) use ($extraInquiryCols) {
            foreach ($extraInquiryCols as [$col, $type]) {
                if (Schema::hasColumn('inquiries', $col)) continue;
                $def = match ($type) {
                    'decimal' => $table->decimal($col, 12, 2),
                    default   => $table->{$type}($col),
                };
                $def->nullable();
            }
        });

        $org = Organization::create(['name' => 'Export Test Org', 'slug' => 'export-test-' . uniqid()]);
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    /** Unzip sheet1 XML out of a BinaryFileResponse's workbook. */
    private function sheetXml(BinaryFileResponse $response): string
    {
        $this->assertSame(XlsxWriter::MIME, $response->headers->get('Content-Type'));
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($response->getFile()->getPathname()));
        $xml = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        $this->assertNotFalse($xml);
        $this->assertNotFalse(simplexml_load_string($xml), 'sheet XML must be well-formed');
        return $xml;
    }

    private function makeGuest(array $overrides = []): Guest
    {
        return Guest::create(array_merge([
            'organization_id' => $this->orgId,
            'full_name'       => 'Jane Doe',
            'email'           => 'jane@example.com',
            'phone'           => '+371 2000 0001',
            'mobile'          => '+371 2000 0002',
            'company'         => 'Acme Travel',
        ], $overrides));
    }

    public function test_inquiries_export_xlsx_includes_guest_contact_details(): void
    {
        $guest    = $this->makeGuest();
        $pipeline = Pipeline::create(['organization_id' => $this->orgId, 'name' => 'Sales', 'is_default' => true]);
        $stage    = PipelineStage::create([
            'organization_id' => $this->orgId, 'pipeline_id' => $pipeline->id,
            'name' => 'Negotiation', 'kind' => 'open', 'sort_order' => 1,
        ]);
        CustomField::create([
            'organization_id' => $this->orgId, 'entity' => 'inquiry',
            'key' => 'budget_band', 'label' => 'Budget Band', 'type' => 'select',
        ]);
        Inquiry::create([
            'organization_id'   => $this->orgId,
            'guest_id'          => $guest->id,
            'pipeline_id'       => $pipeline->id,
            'pipeline_stage_id' => $stage->id,
            'status'            => 'Offer Sent',
            'inquiry_type'      => 'group',
            'total_value'       => 4200.50,
            'custom_data'       => ['budget_band' => 'premium'],
        ]);

        $response = app(InquiryController::class)->export(new Request());

        $xml = $this->sheetXml($response);
        // The headline fix: contact details present on the lead row.
        $this->assertStringContainsString('jane@example.com', $xml);
        $this->assertStringContainsString('+371 2000 0001', $xml);
        $this->assertStringContainsString('+371 2000 0002', $xml);
        // New pipeline/stage + custom-field columns.
        $this->assertStringContainsString('Negotiation', $xml);
        $this->assertStringContainsString('Budget Band', $xml);
        $this->assertStringContainsString('premium', $xml);
        // Money lands as a native number cell, not text (Laravel's
        // decimal:2 cast serialises as "4200.50").
        $this->assertStringContainsString('<v>4200.50</v>', $xml);
    }

    public function test_inquiries_export_respects_ids_filter(): void
    {
        $guest = $this->makeGuest();
        $keep  = Inquiry::create(['organization_id' => $this->orgId, 'guest_id' => $guest->id, 'status' => 'New', 'notes' => 'KEEP-ME']);
        Inquiry::create(['organization_id' => $this->orgId, 'guest_id' => $guest->id, 'status' => 'New', 'notes' => 'DROP-ME']);

        $response = app(InquiryController::class)->export(new Request(['ids' => (string) $keep->id]));

        $xml = $this->sheetXml($response);
        $this->assertStringContainsString('KEEP-ME', $xml);
        $this->assertStringNotContainsString('DROP-ME', $xml);
    }

    public function test_inquiries_export_csv_format_keeps_a_plain_csv_with_contacts(): void
    {
        $this->makeGuest(); // guest exists but inquiry has none — export still runs
        $response = app(InquiryController::class)->export(new Request(['format' => 'csv']));

        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));
        ob_start();
        $response->sendContent();
        $csv = ob_get_clean();
        // Contact columns exist in the CSV header too.
        $this->assertStringContainsString('Email', $csv);
        $this->assertStringContainsString('Phone', $csv);
        $this->assertStringContainsString('Stage', $csv);
    }

    public function test_guests_export_xlsx_includes_full_profile_and_custom_fields(): void
    {
        CustomField::create([
            'organization_id' => $this->orgId, 'entity' => 'guest',
            'key' => 'allergies', 'label' => 'Allergies', 'type' => 'multiselect',
        ]);
        $this->makeGuest([
            'position_title' => 'Procurement Lead',
            'lifecycle_status' => 'customer',
            'custom_data'    => ['allergies' => ['nuts', 'gluten']],
        ]);

        $response = app(GuestController::class)->export(new Request());

        $xml = $this->sheetXml($response);
        $this->assertStringContainsString('jane@example.com', $xml);
        $this->assertStringContainsString('Procurement Lead', $xml);
        $this->assertStringContainsString('Allergies', $xml);
        // Multiselect flattens to a readable comma list.
        $this->assertStringContainsString('nuts, gluten', $xml);
    }

    public function test_guests_export_is_tenant_scoped(): void
    {
        $this->makeGuest(['full_name' => 'Own Org Guest']);

        $otherOrg = Organization::create(['name' => 'Other Org', 'slug' => 'other-' . uniqid()]);
        Guest::withoutEvents(fn() => Guest::create([
            'organization_id' => $otherOrg->id,
            'full_name'       => 'Foreign Guest',
            'email'           => 'foreign@example.com',
        ]));

        $response = app(GuestController::class)->export(new Request());

        $xml = $this->sheetXml($response);
        $this->assertStringContainsString('Own Org Guest', $xml);
        $this->assertStringNotContainsString('Foreign Guest', $xml);
    }
}
