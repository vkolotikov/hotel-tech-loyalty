<?php

namespace Tests\Feature\CrmWorkspace;

use App\Jobs\GenerateLeadAssistant;
use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerBrandVoice;
use App\Models\ContentPlannerProfile;
use App\Models\GuestBusinessProfile;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class LeadAssistantTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();
        foreach ([
            'inquiries' => ['notes' => fn ($table) => $table->text('notes')->nullable()],
            'visitors' => ['guest_id' => fn ($table) => $table->unsignedBigInteger('guest_id')->nullable()],
        ] as $table => $columns) {
            foreach ($columns as $column => $definition) {
                if (! Schema::hasColumn($table, $column)) {
                    Schema::table($table, $definition);
                }
            }
        }
        if (! Schema::hasTable('activities')) {
            Schema::create('activities', function ($table) {
                $table->id();
                $table->foreignId('organization_id');
                $table->foreignId('brand_id')->nullable();
                $table->foreignId('inquiry_id')->nullable();
                $table->foreignId('guest_id')->nullable();
                $table->string('type');
                $table->string('direction')->nullable();
                $table->string('subject')->nullable();
                $table->text('body')->nullable();
                $table->timestamp('occurred_at');
            });
        }
        if (! Schema::hasTable('guest_business_profiles')) {
            (require database_path('migrations/2026_11_22_100000_create_guest_business_profiles.php'))->up();
        }
        if (! Schema::hasTable('crm_lead_assistant')) {
            (require database_path('migrations/2026_11_22_150000_add_crm_sales_assistant.php'))->up();
        }
        config(['openai.api_key' => 'fake-key-for-sales-assistant']);
        Http::preventStrayRequests();
        Queue::fake();
        Mail::fake();
    }

    public function test_reviewed_strategies_and_customer_context_feed_drafts_for_the_right_brand(): void
    {
        $lead = $this->lead(['notes' => 'Customer needs 100 engraved samples.']);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        GuestBusinessProfile::create(['guest_id' => $guest, 'fields' => ['target_audience' => ['Independent design shops']],
            'discovery' => ['fields' => ['service_opportunities' => ['Unreviewed AI idea']]]]);
        $this->chat(['inquiry_id' => $lead], [['visitor', 'Please prioritise a matte finish.', 15]]);
        $otherBrand = $this->brand();
        $this->chat(['inquiry_id' => $lead, 'brand_id' => $otherBrand], [['visitor', 'Another brand chat', 15]]);
        $this->activity($lead, $this->brandId, 'Asked for recyclable packaging by email.');
        $this->activity($lead, $otherBrand, 'Another brand email');
        $this->asManager()->putJson($this->crmApi('sales-profile?brand_id='.$this->brandId), [
            'profile_brand' => $this->brandId, 'revision' => 0, 'fields' => ['offerings' => 'Engraving and recyclable packaging', 'usp' => 'Local production'],
        ])->assertOk();
        $this->putJson($this->crmApi('sales-profile?brand_id='.$otherBrand), [
            'profile_brand' => $otherBrand, 'revision' => 0, 'fields' => ['offerings' => 'Another brand offering'],
        ])->assertOk();
        Http::fake(['api.openai.com/v1/responses' => Http::sequence()
            ->push($this->providerOutput(['summary' => 'Customer needs samples', 'sections' => [['title' => 'Priorities', 'body' => 'AI recommendation only']], 'review_notes' => []]))
            ->push($this->providerOutput(['subject' => 'Engraved sample proposal', 'body' => 'Here is the draft.', 'review_notes' => ['Check sample turnaround.']]))
            ->push($this->providerOutput(['summary' => 'Growing in Belgian shops', 'sections' => [], 'review_notes' => []]))]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->getJson($path)->assertOk()->assertJsonPath('brand.id', $this->brandId);
        $this->putJson($path, ['mode' => 'marketing_strategy', 'revision' => 0, 'body' => 'Approved marketing approach'])->assertOk();
        $run = $this->postJson($path, ['mode' => 'sales_strategy', 'language' => 'en', 'focus' => 'Include packaging.'])
            ->assertAccepted()->assertJsonPath('run.status', 'queued')->assertJsonMissingPath('run.focus')->json('run.id');
        $this->postJson($path, ['mode' => 'proposal', 'language' => 'en'])->assertAccepted()->assertJsonPath('run.id', $run);
        Queue::assertPushed(GenerateLeadAssistant::class, 1);
        $job = Queue::pushed(GenerateLeadAssistant::class)->first();
        $this->app->call([$job, 'handle']);
        $this->app->call([$job, 'handle']);
        Http::assertSentCount(1);
        $this->getJson($path)->assertOk()->assertJsonPath('results.sales_strategy.summary', 'Customer needs samples')
            ->assertJsonPath('results.sales_strategy.coverage.chats', 1)
            ->assertJsonPath('results.sales_strategy.coverage.activities', 1)
            ->assertJsonMissingPath('strategies.sales_strategy');

        $this->putJson($path, ['mode' => 'sales_strategy', 'revision' => 1, 'body' => 'Discuss the approved sample plan'])
            ->assertOk()->assertJsonPath('revision', 2);
        $this->putJson($path, ['mode' => 'sales_strategy', 'revision' => 1, 'body' => 'Stale write'])
            ->assertConflict()->assertJsonPath('error', 'strategy_changed');
        $this->postJson($path, ['mode' => 'proposal', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.proposal.subject', 'Engraved sample proposal')
            ->assertJsonPath('results.proposal.coverage.strategies', ['marketing_strategy', 'sales_strategy'])
            ->assertJsonPath('results.proposal.coverage.email_state', 'not_connected');
        $this->postJson($path, ['mode' => 'marketing_strategy', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.marketing_strategy.summary', 'Growing in Belgian shops')
            ->assertJsonPath('strategies.marketing_strategy.body', 'Approved marketing approach');
        $recorded = Http::recorded();
        $input = $recorded[1][0]['input'];
        foreach (['Customer needs 100 engraved samples.', 'matte finish', 'recyclable packaging by email', 'Independent design shops',
            'Engraving and recyclable packaging', 'Local production', 'Discuss the approved sample plan', 'Approved marketing approach'] as $fact) {
            $this->assertStringContainsString($fact, $input);
        }
        foreach (['Another brand', 'Unreviewed AI idea', 'AI recommendation only', '@example.test'] as $absent) {
            $this->assertStringNotContainsString($absent, $input);
        }
        $this->assertFalse($recorded[1][0]['store']);
        $this->assertArrayNotHasKey('tools', $recorded[1][0]->data());
        $this->assertDatabaseHas('ai_usage_logs', ['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
            'user_id' => $this->staffMember->id, 'feature' => 'crm_sales_assistant']);
        Mail::assertNothingSent();
    }

    public function test_reply_includes_matched_email_bodies_and_whatsapp_from_the_existing_bridges(): void
    {
        $brand = $this->brand(23);
        $lead = $this->lead(['brand_id' => $brand]);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $email = DB::table('guests')->where('id', $guest)->value('email');
        DB::table('guests')->where('id', $guest)->update(['phone' => '+32 470 82 60 01']);
        config(['crm_mail.token' => 'fake-crm-mail-token-for-sales-assistant']);
        $inbound = (string) Str::uuid();
        $outbound = (string) Str::uuid();
        Http::fake([
            'contacts.hexa-tech.uk/api/integrations/crm-mail/*' => function (Request $request) use ($email, $inbound, $outbound) {
                $this->assertSame($email, $request['email']);
                $this->assertContains($request['action'], ['list', 'content']);

                return $request['action'] === 'list' ? Http::response(['connected' => true, 'messages' => [
                    ['id' => $outbound, 'subject' => 'Our initial reply', 'participants' => ['from' => ['desk@example.test']]],
                    ['id' => $inbound, 'subject' => 'Prototype timing', 'participants' => ['from' => ["Customer <$email>"]]],
                ]]) : Http::response(['body' => $request['message_id'] === $inbound ? 'Please confirm prototype timing' : 'We are checking.']);
            },
            'contacts.hexa-tech.uk/api/integrations/crm-whatsapp/*' => Http::response(['state' => 'connected', 'messages' => [
                ['direction' => 'inbound', 'body' => 'I can approve the artwork Friday.'],
            ]]),
            'api.openai.com/v1/responses' => Http::response($this->providerOutput([
                'subject' => 'Re: Prototype timing', 'body' => 'Thanks for the update. We will confirm the production schedule.', 'review_notes' => [],
            ])),
        ]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->postJson($path, ['mode' => 'reply', 'language' => 'fr'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()
            ->assertJsonPath('results.reply.coverage.reply_to.subject', 'Prototype timing')
            ->assertJsonPath('results.reply.coverage.emails', 2)->assertJsonPath('results.reply.coverage.whatsapp', 1);
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.openai.com/v1/responses'
            && str_contains($request['input'], 'Please confirm prototype timing')
            && str_contains($request['input'], 'We are checking.')
            && str_contains($request['input'], 'I can approve the artwork Friday.')
            && json_decode($request['input'], true)['language'] === 'fr');
        Mail::assertNothingSent();
    }

    public function test_crm_profile_reuses_the_current_brands_content_and_manual_values_take_precedence(): void
    {
        if (! Schema::hasTable('content_planner_profiles')) {
            (require database_path('migrations/2026_07_08_000000_create_content_planner_tables.php'))->up();
            (require database_path('migrations/2026_07_08_200000_upgrade_content_planner_tables.php'))->up();
            (require database_path('migrations/2026_10_15_100100_create_content_planner_snippets_table.php'))->up();
        }
        $this->org->forceFill(['entitled_products' => null])->save();
        $this->org->setWorkspace('content', true);
        $profile = ContentPlannerProfile::create(['brand_id' => $this->brandId, 'name' => 'Planner business', 'usp' => 'Planner USP']);
        $profile->audiences()->save(new ContentPlannerAudience(['brand_id' => $this->brandId, 'name' => 'Studio owners', 'country' => 'BE']));
        $profile->audiences()->save(new ContentPlannerAudience(['brand_id' => $this->brandId, 'name' => 'Assumed group', 'is_ai_assumed' => true]));
        $profile->brandVoices()->save(new ContentPlannerBrandVoice(['brand_id' => $this->brandId, 'name' => 'Voice', 'tone' => 'Plain-language']));
        $other = $this->brand();
        ContentPlannerProfile::create(['brand_id' => $other, 'name' => 'Separate brand', 'usp' => 'Other USP']);
        $path = $this->crmApi('sales-profile?brand_id=all');
        $this->asStaffMember()->getJson($path)->assertOk()->assertJsonPath('brand.id', $this->brandId)
            ->assertJsonPath('fields.usp', 'Planner USP')->assertJsonPath('fields.audiences', 'Studio owners')
            ->assertJsonPath('fields.markets', 'BE')->assertJsonPath('fields.voice', 'Plain-language');
        $data = ['profile_brand' => $this->brandId, 'revision' => 0, 'fields' => ['usp' => 'Reviewed CRM USP', 'offerings' => 'Brand workshop']];
        $this->putJson($path, $data)->assertForbidden();
        $this->asManager()->putJson($path, $data)->assertOk()->assertJsonPath('fields.usp', 'Reviewed CRM USP')
            ->assertJsonPath('inherited.usp', 'Planner USP')->assertJsonPath('fields.offerings', 'Brand workshop');
        $this->putJson($path, $data)->assertConflict()->assertJsonPath('error', 'sales_profile_changed');
        $this->putJson($path, ['profile_brand' => $this->brandId, 'revision' => 1, 'fields' => ['usp' => null]])
            ->assertOk()->assertJsonPath('fields.usp', 'Planner USP')->assertJsonPath('fields.offerings', 'Brand workshop');
        $this->assertSame('Planner USP', $profile->fresh()->usp);
        $this->getJson($this->crmApi('sales-profile?brand_id='.$other))->assertOk()->assertJsonPath('fields.usp', 'Other USP')
            ->assertJsonMissingPath('fields.offerings');
        $this->getJson($path.'&for_brand='.$other)->assertOk()->assertJsonPath('brand.id', $other);
    }

    public function test_access_and_budget_are_rechecked_before_a_queued_job_can_run(): void
    {
        $lead = $this->lead(['brand_id' => $this->brand()]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $other = Organization::create(['name' => 'Other tenant', 'slug' => 'other-lead-assistant-test']);
        $otherGuest = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Other Contact']);
        $outside = DB::table('inquiries')->insertGetId([
            'organization_id' => $other->id, 'guest_id' => $otherGuest, 'source' => 'website', 'status' => 'New',
        ]);
        $this->asStaffMember()->getJson($this->crmApi("leads/$outside/assistant?brand_id=all"))->assertNotFound();
        $this->postJson($path, ['mode' => 'brief', 'language' => 'en'])->assertAccepted();
        $this->staffMember->brands()->attach($this->brandId);
        $this->runLatest();
        $this->asManager()->getJson($path)->assertOk()->assertJsonPath('run.error', 'assistant_access_changed');
        $this->asStaffMember()->getJson($path)->assertNotFound();
        $this->org->forceFill(['plan_features' => ['ai_monthly_cost_cents' => 1]])->save();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'gpt-5-mini',
            'feature' => 'crm_sales_assistant', 'cost_cents' => 2, 'created_at' => now()]);
        Cache::forget('ai_usage:month:'.$this->org->id.':'.now()->format('Y-m'));
        $this->asManager()->postJson($path, ['mode' => 'brief', 'language' => 'en'])
            ->assertForbidden()->assertJsonPath('error', 'ai_budget_used_up');
        Queue::assertPushed(GenerateLeadAssistant::class, 1);
        Http::assertNothingSent();
    }

    private function brand(?int $id = null): int
    {
        return DB::table('brands')->insertGetId(array_filter(['id' => $id]) + [
            'organization_id' => $this->org->id, 'name' => 'Other brand', 'slug' => 'other-brand',
            'widget_token' => (string) Str::uuid(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function activity(int $lead, int $brand, string $body): void
    {
        DB::table('activities')->insert(['organization_id' => $this->org->id, 'inquiry_id' => $lead, 'brand_id' => $brand,
            'type' => 'email', 'direction' => 'inbound', 'body' => $body, 'occurred_at' => now()]);
    }

    private function runLatest(): void
    {
        $this->app->call([Queue::pushed(GenerateLeadAssistant::class)->last(), 'handle']);
    }

    private function providerOutput(array $result): array
    {
        return [
            'status' => 'completed',
            'output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($result, JSON_THROW_ON_ERROR)]]]],
            'usage' => ['input_tokens' => 2040, 'output_tokens' => 230],
        ];
    }
}
