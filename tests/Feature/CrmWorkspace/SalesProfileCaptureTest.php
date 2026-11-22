<?php

namespace Tests\Feature\CrmWorkspace;

use App\Jobs\CaptureSalesProfile;
use App\Models\Brand;
use App\Models\Organization;
use App\Services\Content\Web\HostResolver;
use App\Services\Crm\SalesProfile;
use App\Services\Crm\SalesProfileCapture;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class SalesProfileCaptureTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();
        if (! Schema::hasTable('crm_lead_assistant')) {
            (require database_path('migrations/2026_11_22_150000_add_crm_sales_assistant.php'))->up();
        }
        if (! Schema::hasTable('crm_sales_profile_captures')) {
            (require database_path('migrations/2026_11_22_170000_create_crm_sales_profile_captures.php'))->up();
        }
        config(['openai.api_key' => 'test-key-for-profile-capture']);
        Queue::fake();
        Http::preventStrayRequests();
    }

    public function test_website_document_and_public_search_suggestions_keep_verified_sources_and_require_a_save(): void
    {
        $this->mock(HostResolver::class)->shouldReceive('resolve')->with('studio.example.com')->andReturn(['93.184.216.34']);
        $public = 'https://directory.example.com/studio';
        $private = 'Private sample policy. Minimum order 100 units.';
        Http::fake([
            'https://studio.example.com/robots.txt' => Http::response("User-agent: *\nDisallow: /private\n"),
            'https://studio.example.com/' => Http::response(
                '<h1>Example Studio and local production</h1><p>Premium samples.</p><a href="/services">Services</a><a href="/private">Private</a>',
                200, ['Content-Type' => 'text/html'],
            ),
            'https://studio.example.com/services' => Http::response(
                '<h1>Engraving and artwork review</h1><p>Metal and wood.</p>', 200, ['Content-Type' => 'text/html'],
            ),
            'https://api.openai.com/v1/responses' => function (Request $request) use ($public, $private) {
                $this->assertFalse($request['store']);
                $this->assertSame(SalesProfile::keys(), array_keys($request['text']['format']['schema']['properties']['fields']['properties']));
                if (isset($request['tools'])) {
                    $this->assertSame('web_search', $request['tools'][0]['type']);
                    $this->assertStringNotContainsString('Policy.txt', $request['input']);
                    $this->assertStringNotContainsString(base64_encode($private), $request['input']);
                    $this->assertStringNotContainsString('Premium samples', $request['input']);

                    return Http::response($this->providerOutput([
                        'markets' => ['value' => 'Belgium and Latvia', 'references' => [$public]],
                        'proof' => ['value' => 'Unverified top award', 'references' => ['https://fabricated.example.com/']],
                    ], [$public]));
                }
                $blocks = $request['input'][0]['content'];
                $this->assertStringContainsString('Engraving and artwork review', $blocks[0]['text']);
                $this->assertSame('file-1.txt', $blocks[1]['filename']);
                $this->assertSame('data:text/plain;base64,'.base64_encode($private), $blocks[1]['file_data']);

                return Http::response($this->providerOutput([
                    'offerings' => ['value' => 'Engraving and artwork review', 'references' => ['page-2']],
                    'terms' => ['value' => 'Minimum order 100 units', 'references' => ['file-1.txt']],
                    'proof' => ['value' => 'A false claim', 'references' => ['file-42']],
                ]));
            },
        ]);
        $this->asManager()->putJson($this->profile(), [
            'profile_brand' => $this->brandId, 'revision' => 0, 'fields' => ['overview' => 'Approved overview'],
        ])->assertOk();
        $first = $this->post($this->path(), $this->inputs([
            'website' => 'https://studio.example.com/?tracking=1', 'search_web' => '1',
            'attachments' => [UploadedFile::fake()->createWithContent('Policy.txt', $private)],
        ]), ['Accept' => 'application/json'])
            ->assertAccepted()->assertJsonPath('capture.status', 'queued')->assertJsonMissingPath('capture.input')->json('capture.id');
        $encrypted = DB::table('crm_sales_profile_captures')->where('brand_id', $this->brandId)->value('input');
        $this->assertIsString($encrypted);
        $this->assertStringNotContainsString(base64_encode($private), $encrypted);
        $this->postJson($this->path(), $this->inputs(['website' => 'https://studio.example.com/']))
            ->assertAccepted()->assertJsonPath('capture.id', $first);
        Queue::assertPushed(CaptureSalesProfile::class, 1);
        $job = Queue::pushed(CaptureSalesProfile::class)->first();
        $this->app->call([$job, 'handle']);
        $this->app->call([$job, 'handle']);
        Http::assertSentCount(5);
        $this->assertDatabaseHas('crm_sales_profile_captures', ['brand_id' => $this->brandId, 'input' => null]);
        $this->getJson($this->path())->assertOk()
            ->assertJsonPath('capture.status', 'ready')
            ->assertJsonPath('capture.fields.offerings.sources.0.url', 'https://studio.example.com/services')
            ->assertJsonPath('capture.fields.terms.sources.0.title', 'Policy.txt')
            ->assertJsonPath('capture.fields.markets.sources.0.url', $public)
            ->assertJsonMissingPath('capture.fields.proof');
        $this->getJson($this->profile())->assertOk()->assertJsonPath('fields.overview', 'Approved overview')
            ->assertJsonMissingPath('fields.terms');
        $this->putJson($this->profile(), [
            'profile_brand' => $this->brandId, 'revision' => 1, 'capture_id' => $first,
            'fields' => ['offerings' => 'Engraving and artwork review', 'terms' => 'Minimum order 100 units'],
        ])->assertOk()->assertJsonPath('fields.overview', 'Approved overview')
            ->assertJsonPath('sources.terms.0.title', 'Policy.txt');
        $this->putJson($this->profile(), [
            'profile_brand' => $this->brandId, 'revision' => 2, 'capture_id' => $first,
            'fields' => ['terms' => 'Minimum order 150 units'],
        ])->assertOk()->assertJsonMissingPath('sources.terms')->assertJsonPath('fields.terms', 'Minimum order 150 units');
        $this->assertSame(2, DB::table('ai_usage_logs')->where('brand_id', $this->brandId)->where('feature', 'crm_sales_capture')->count());
    }

    public function test_only_authorized_managers_can_capture_and_private_addresses_or_wrong_files_are_rejected(): void
    {
        $other = Organization::create(['name' => 'External organization', 'slug' => 'external-profile-capture']);
        $foreignBrand = Brand::withoutGlobalScopes()->where('organization_id', $other->id)->firstOrFail()->id;
        $this->asStaffMember()->getJson($this->path())->assertForbidden();
        $this->postJson($this->path(), $this->inputs())->assertForbidden();
        $this->asManager()->getJson($this->path().'&for_brand='.$foreignBrand)->assertNotFound();
        $this->postJson($this->path(), $this->inputs(['website' => 'http://127.0.0.1/']))
            ->assertUnprocessable()->assertJsonPath('error', 'capture_bad_website');
        $this->post($this->path(), $this->inputs(['attachments' => [
            UploadedFile::fake()->createWithContent('malformed.pdf', 'Not a PDF'),
        ]]), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('attachments.0');
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    public function test_a_website_that_cannot_be_read_uses_only_its_own_indexed_sources(): void
    {
        $this->mock(HostResolver::class)->shouldReceive('resolve')->with('studio.example.com')->andReturn(['93.184.216.34']);
        $site = 'https://studio.example.com/';
        $other = 'https://other.example.com/';
        Http::fake([
            'https://studio.example.com/robots.txt' => Http::response('', 404),
            'https://studio.example.com/' => Http::response('', 202),
            'https://api.openai.com/v1/responses' => function (Request $request) use ($site, $other) {
                $this->assertSame(['studio.example.com'], $request['tools'][0]['filters']['allowed_domains']);

                return Http::response($this->providerOutput([
                    'name' => ['value' => 'Studio', 'references' => [$site]],
                    'proof' => ['value' => 'Award from another company', 'references' => [$other]],
                ], [$site, $other]));
            },
        ]);
        $this->asManager()->postJson($this->path(), $this->inputs(['website' => $site]))->assertAccepted();
        $this->app->call([Queue::pushed(CaptureSalesProfile::class)->first(), 'handle']);
        $this->getJson($this->path())->assertOk()->assertJsonPath('capture.status', 'ready')
            ->assertJsonPath('capture.fields.name.value', 'Studio')->assertJsonMissingPath('capture.fields.proof')
            ->assertJsonPath('capture.warnings', ['capture_website_indexed']);
    }

    public function test_attachment_input_is_removed_when_the_request_expires_or_access_is_revoked(): void
    {
        $this->asManager()->post($this->path(), $this->inputs(['attachments' => [
            UploadedFile::fake()->createWithContent('guide.csv', "Product,Detail\nWorkshop,On-site workshop"),
        ]]), ['Accept' => 'application/json'])->assertAccepted();
        $this->travel(21)->minutes();
        $this->assertSame(1, SalesProfileCapture::expirePending());
        $this->getJson($this->path())->assertOk()->assertJsonPath('capture.error', 'capture_timed_out');
        $this->assertDatabaseHas('crm_sales_profile_captures', ['brand_id' => $this->brandId, 'input' => null]);

        $this->post($this->path(), $this->inputs(['attachments' => [
            UploadedFile::fake()->createWithContent('guide.txt', 'Private brand guide'),
        ]]), ['Accept' => 'application/json'])->assertAccepted();
        DB::table('staff')->where('user_id', $this->manager->id)->update(['is_active' => false]);
        $this->app->call([Queue::pushed(CaptureSalesProfile::class)->last(), 'handle']);
        $this->assertDatabaseHas('crm_sales_profile_captures', ['brand_id' => $this->brandId, 'status' => 'failed', 'input' => null]);
        Http::assertNothingSent();
    }

    private function profile(): string
    {
        return $this->crmApi('sales-profile?brand_id=all');
    }

    private function path(): string
    {
        return $this->crmApi('sales-profile/capture?brand_id=all');
    }

    private function inputs(array $values = []): array
    {
        return $values + ['profile_brand' => $this->brandId, 'company_name' => 'Example Studio', 'language' => 'en'];
    }

    private function providerOutput(array $fields, array $urls = []): array
    {
        $output = [];
        foreach ($urls as $url) {
            $output[] = ['type' => 'web_search_call', 'action' => ['type' => 'search', 'sources' => [['url' => $url, 'title' => 'Business directory']]]];
        }
        $output[] = ['type' => 'message', 'content' => [[
            'type' => 'output_text', 'text' => json_encode(['identity_confirmed' => true, 'fields' => $fields], JSON_THROW_ON_ERROR),
        ]]];

        return ['status' => 'completed', 'output' => $output, 'usage' => ['input_tokens' => 2000, 'output_tokens' => 600]];
    }
}
