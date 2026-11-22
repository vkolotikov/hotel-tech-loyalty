<?php

namespace Tests\Feature\CrmWorkspace;

use App\Jobs\DiscoverGuestBusiness;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use OpenAI\Laravel\Facades\OpenAI;
use OpenAI\Resources\Chat;
use OpenAI\Responses\Chat\CreateResponse;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class BusinessProfileTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        if (! Schema::hasColumn('inquiries', 'notes')) {
            Schema::table('inquiries', fn ($table) => $table->text('notes')->nullable());
        }
        if (! Schema::hasTable('activities')) {
            Schema::create('activities', function ($table) {
                $table->id();
                $table->foreignId('organization_id');
                $table->foreignId('inquiry_id')->nullable();
                $table->timestamp('occurred_at')->nullable();
            });
        }
        if (! Schema::hasTable('guest_business_profiles')) {
            (require database_path('migrations/2026_11_22_100000_create_guest_business_profiles.php'))->up();
        }
        config(['openai.api_key' => 'test-key-for-http-fake']);
        Http::preventStrayRequests();
        Queue::fake();
    }

    public function test_discovery_researches_public_identity_and_only_reviewed_values_feed_proposals(): void
    {
        [$lead, $guest] = $this->record();
        $source = 'https://studio.example.com/about';
        Http::fake(['api.openai.com/v1/responses' => Http::response([
            'status' => 'completed',
            'output' => [
                ['type' => 'web_search_call', 'action' => ['type' => 'search', 'sources' => [['url' => $source]]]],
                ['type' => 'message', 'content' => [[
                    'type' => 'output_text',
                    'text' => json_encode([
                        'identity_confirmed' => true,
                        'fields' => [
                            'services' => ['value' => ['Web design'], 'source_urls' => [$source]],
                            'markets' => ['value' => ['Worldwide'], 'source_urls' => ['https://invented.example.com']],
                        ],
                        'opportunities' => ['Discuss sample packaging.'],
                        'questions' => ['Where will the cards be used?'],
                    ], JSON_THROW_ON_ERROR),
                    'annotations' => [['type' => 'url_citation', 'url' => $source, 'title' => 'Studio profile']],
                ]]],
            ],
            'usage' => ['input_tokens' => 1250, 'output_tokens' => 150],
        ])]);

        $path = $this->adminApi("inquiries/$lead/business-profile");
        $contact = $this->adminApi("guests/$guest/business-profile");
        $this->asStaffMember()->getJson($path)->assertOk()->assertJsonPath('revision', 0)->assertJsonPath('suggested_company', 'Sample Studio');
        $first = $this->postJson($path, ['company_name' => 'Sample Studio', 'website_url' => $source, 'language' => 'en'])
            ->assertAccepted()->assertJsonPath('discovery.status', 'queued')->json('discovery.id');
        $this->postJson($path, ['language' => 'en'])->assertAccepted()->assertJsonPath('discovery.id', $first);
        Queue::assertPushed(DiscoverGuestBusiness::class, 1);
        $job = Queue::pushed(DiscoverGuestBusiness::class)->first();
        $this->app->call([$job, 'handle']);
        $this->app->call([$job, 'handle']);
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => $request['tool_choice'] === 'required'
            && $request['tools'][0]['type'] === 'web_search'
            && ! str_contains($request['input'], 'Private enquiry for 100 cards')
            && ! str_contains($request['input'], '@example.test')
            && $request['store'] === false);

        $this->getJson($contact)->assertOk()->assertJsonPath('discovery.fields.services.0', 'Web design')
            ->assertJsonPath('discovery.sources.services.0.title', 'Studio profile')
            ->assertJsonMissingPath('discovery.fields.markets')
            ->assertJsonMissingPath('fields.services');

        $proposal = OpenAI::fake([CreateResponse::fake(['choices' => [['message' => [
            'role' => 'assistant', 'content' => '{"subject":"Cards for your studio","body":"A draft for you."}',
        ]]]])]);
        $this->putJson($contact, ['revision' => 0, 'discovery_id' => $first, 'fields' => [
            'company_name' => 'Sample Studio', 'services' => ['Web design'], 'service_opportunities' => ['Sample packaging'],
        ]])->assertOk()->assertJsonPath('sources.services.0.url', $source)->assertJsonPath('revision', 1);
        $this->postJson($this->adminApi("inquiries/$lead/draft-proposal"))->assertOk()->assertJsonPath('subject', 'Cards for your studio');
        $proposal->assertSent(Chat::class, fn (string $method, array $args): bool => $method === 'create'
            && str_contains($args['messages'][0]['content'], 'Web design')
            && str_contains($args['messages'][0]['content'], 'Private enquiry for 100 cards')
            && ! str_contains($args['messages'][0]['content'], 'Worldwide'));
        $this->assertDatabaseHas('ai_usage_logs', ['organization_id' => $this->org->id, 'user_id' => $this->staffMember->id, 'feature' => 'crm_discovery']);

        $this->putJson($path, ['revision' => 0, 'fields' => ['services' => ['Old text']]])
            ->assertConflict()->assertJsonPath('error', 'profile_changed');
        $this->putJson($path, ['revision' => 1, 'fields' => ['services' => ['Web design and support']]])
            ->assertOk()->assertJsonMissingPath('sources.services');
    }

    public function test_foreign_records_bad_urls_and_exhausted_allowances_cannot_start_discovery(): void
    {
        [$lead] = $this->record();
        $other = Organization::create(['name' => 'Other tenant', 'slug' => 'other-business-test']);
        $foreign = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Other Contact']);
        $path = $this->adminApi("inquiries/$lead/business-profile");
        $this->asStaffMember()->getJson($this->adminApi("guests/$foreign/business-profile"))->assertNotFound();
        $this->postJson($path, ['website_url' => 'http://127.0.0.1/private', 'language' => 'en'])
            ->assertUnprocessable()->assertJsonValidationErrors('website_url');

        $this->org->forceFill(['plan_features' => ['ai_monthly_cost_cents' => 1]])->save();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'gpt-5-mini',
            'feature' => 'crm_discovery', 'cost_cents' => 2, 'created_at' => now()]);
        $this->postJson($path, ['language' => 'en'])->assertForbidden()->assertJsonPath('error', 'ai_budget_used_up');
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    private function record(): array
    {
        $lead = $this->lead(['notes' => 'Private enquiry for 100 cards']);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['company' => 'Sample Studio']);

        return [$lead, $guest];
    }
}
