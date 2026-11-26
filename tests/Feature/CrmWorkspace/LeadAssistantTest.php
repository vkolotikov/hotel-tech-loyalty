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
        $this->setUpLeadAssistantTables();
        config(['openai.api_key' => 'fake-key-for-sales-assistant']);
        Http::preventStrayRequests();
        Queue::fake();
        Mail::fake();
    }

    public function test_the_richer_brief_also_updates_the_existing_pipeline_signals(): void
    {
        $lead = $this->lead(['notes' => 'Customer asked about lead time and sample options.']);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        Http::fake(['api.openai.com/v1/responses' => Http::response($this->providerOutput([
            'summary' => 'The client is reviewing a sample.', 'sections' => [], 'review_notes' => [],
            'signals' => ['intent' => 'info_request', 'win_probability' => 72, 'going_cold_risk' => 'low',
                'suggested_action' => 'Confirm the sample lead time.'],
        ]))]);

        $this->asStaffMember()->postJson($path, ['mode' => 'brief', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.brief.signals.win_probability', 72)
            ->assertJsonPath('results.brief.signals.going_cold_risk', 'low');
        $this->assertDatabaseHas('inquiries', [
            'id' => $lead, 'ai_brief' => 'The client is reviewing a sample.', 'ai_intent' => 'info_request',
            'ai_win_probability' => 72, 'ai_going_cold_risk' => 'low', 'ai_suggested_action' => 'Confirm the sample lead time.',
        ]);
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
        $this->assertSame('gpt-5-mini', $recorded[0][0]['model']);
        $this->assertSame('gpt-6.2-astra', $recorded[1][0]['model']);
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

    public function test_company_knowledge_is_live_in_both_directions_and_private_email_instructions_stay_in_crm(): void
    {
        $lead = $this->lead(['notes' => 'Can the enamel proof be supplied on a bronze card?']);
        $other = $this->brand();
        foreach ([[$this->brandId, 'The enamel code is Cobalt-18.', true], [$other, 'Wrong brand finish.', true],
            [$this->brandId, 'Withdrawn finish.', false]] as [$brand, $answer, $active]) {
            DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'brand_id' => $brand,
                'question' => 'Which enamel finish?', 'answer' => $answer, 'is_active' => $active]);
        }
        DB::table('knowledge_documents')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
            'file_name' => 'Material guide', 'file_path' => 'guide.txt', 'mime_type' => 'text/plain', 'size_bytes' => 5000,
            'processing_status' => 'completed', 'extracted_text' => str_repeat('Introduction. ', 250).'Bronze enamel uses finish B72.']);
        $profile = $this->crmApi('sales-profile?brand_id='.$this->brandId);
        $this->asManager()->putJson($profile, ['profile_brand' => $this->brandId, 'revision' => 0,
            'fields' => ['offerings' => 'Recycled bronze cards', 'goal' => 'Help buyers compare samples', 'email_instructions' => 'Always lead with the finish code'],
            'shared_fields' => ['offerings']])->assertOk()->assertJsonPath('knowledge.answers', 1);
        $this->assertDatabaseHas('chatbot_behavior_configs', ['brand_id' => $this->brandId, 'goal' => 'Help buyers compare samples']);
        $kb = app(\App\Services\KnowledgeService::class);
        $public = $kb->getKnowledgeContext('enamel', $this->org->id, $this->brandId);
        $this->assertStringContainsString('Recycled bronze cards', $public);
        $this->assertStringContainsString('Cobalt-18', $public);
        $this->assertStringNotContainsString('lead with the finish', $public);
        $this->assertStringNotContainsString('Recycled bronze', $kb->getKnowledgeContext('enamel', $this->org->id, $other));

        $this->asManager()->putJson($profile, ['profile_brand' => $this->brandId, 'revision' => 1, 'fields' => ['goal' => 'Outdated'],
            'expected_goal' => 'A stale goal'])->assertConflict();
        $this->putJson($this->adminApi('chatbot-config/behavior?brand_id='.$this->brandId), ['goal' => 'Check artwork before quoting'])->assertOk();
        $this->getJson($profile)->assertOk()->assertJsonPath('fields.goal', 'Check artwork before quoting');
        Http::fake(['api.openai.com/v1/responses' => Http::response($this->providerOutput([
            'subject' => 'Bronze proof', 'body' => "The finish is Cobalt-18.\n\nBest regards,\nAnne\nSales Team", 'review_notes' => [],
        ]))]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        foreach (['reply', 'proposal'] as $mode) {
            $this->asStaffMember()->postJson($path, ['mode' => $mode, 'language' => 'en'])->assertAccepted();
            $this->runLatest();
            $this->getJson($path)->assertOk()->assertJsonPath("results.$mode.coverage.knowledge_answers", 1)
                ->assertJsonPath("results.$mode.coverage.knowledge_documents", 1)->assertJsonPath("results.$mode.body", 'The finish is Cobalt-18.');
        }
        foreach (Http::recorded() as [$request]) {
            foreach (['Cobalt-18', 'B72', 'Check artwork before quoting', 'Always lead with the finish code'] as $value) {
                $this->assertStringContainsString($value, $request['input']);
            }
            foreach (['Wrong brand finish', 'Withdrawn finish'] as $value) {
                $this->assertStringNotContainsString($value, $request['input']);
            }
        }
        $this->asManager()->putJson($profile, ['profile_brand' => $this->brandId, 'revision' => 1, 'fields' => [],
            'shared_fields' => []])->assertOk();
        $this->assertStringNotContainsString('Recycled bronze cards', $kb->getKnowledgeContext('enamel', $this->org->id, $this->brandId));
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
                ]]) : Http::response(['body' => $request['message_id'] === $inbound
                    ? "Please confirm prototype timing\n\nOn Tue, our sales desk wrote:\n> Staff boilerplate." : 'We are checking.']);
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
            ->assertJsonPath('results.reply.coverage.writing_samples', 2)
            ->assertJsonPath('results.reply.coverage.emails', 2)->assertJsonPath('results.reply.coverage.whatsapp', 1);
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.openai.com/v1/responses'
            && str_contains($request['input'], 'Please confirm prototype timing')
            && str_contains($request['input'], 'We are checking.')
            && str_contains($request['input'], 'I can approve the artwork Friday.')
            && json_decode($request['input'], true)['language'] === 'fr'
            && json_decode($request['input'], true)['conversation']['customer_writing_samples'] === [
                ['channel' => 'email', 'words' => 'Please confirm prototype timing'],
                ['channel' => 'whatsapp', 'words' => 'I can approve the artwork Friday.'],
            ]);
        $this->assertDatabaseHas('ai_usage_logs', ['model' => 'gpt-6.2-astra', 'feature' => 'crm_sales_assistant', 'cost_cents' => 3]);
        Mail::assertNothingSent();
    }

    public function test_customer_history_and_sourced_discovery_stay_distinct_from_the_current_request(): void
    {
        $lead = $this->lead(['notes' => 'Current matte sample']);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $earlier = $this->lead(['guest_id' => $guest]);
        $this->activity($earlier, $this->brandId, 'Prior order was glossy.');
        $this->activity($this->lead(), $this->brandId, 'Another contact order.');
        $this->activity($this->lead(['guest_id' => $guest, 'brand_id' => $this->brand()]), $this->brandId, 'Wrong parent brand.');
        $this->chat(['inquiry_id' => $lead], [['visitor', 'Friday works for the matte proof.', 5], ['agent', 'Desk wording', 2]]);
        GuestBusinessProfile::create(['guest_id' => $guest, 'fields' => ['industry' => 'Design studio'],
            'discovery' => ['status' => 'ready', 'fields' => ['industry' => 'Wrong industry', 'services' => ['Letterpress'], 'markets' => ['Unsourced market']],
                'sources' => ['industry' => [['url' => 'https://example.org/about']], 'services' => [['url' => 'https://example.org/studio']]]]]);
        Http::fake(['api.openai.com/v1/responses' => Http::response($this->providerOutput([
            'subject' => 'Matte proof', 'body' => 'Friday works.', 'review_notes' => [],
        ]))]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.reply.coverage.reply_to.channel', 'chat')
            ->assertJsonPath('results.reply.coverage.other_logged_emails', 1)->assertJsonPath('results.reply.coverage.discovery_fields', 1);
        $input = json_decode(Http::recorded()->sole()[0]['input'], true);
        $this->assertSame(['services' => ['value' => ['Letterpress'], 'sources' => ['https://example.org/studio']]], $input['unreviewed_discovery']);
        $this->assertSame('Design studio', $input['reviewed_customer_business']['industry']);
        $this->assertSame(['Prior order was glossy.'], array_column($input['conversation']['other_logged_customer_emails'], 'body'));
        $this->assertSame([['channel' => 'chat', 'words' => 'Friday works for the matte proof.']], $input['conversation']['customer_writing_samples']);
    }

    public function test_an_inbound_email_on_an_older_page_is_the_target_even_when_newer_messages_are_all_outgoing(): void
    {
        $brand = $this->brand(23);
        $lead = $this->lead(['brand_id' => $brand]);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $email = DB::table('guests')->where('id', $guest)->value('email');
        config(['crm_mail.token' => 'fake-crm-mail-token-for-sales-assistant']);
        $out = collect(range(1, 25))->map(fn ($i) => ['id' => (string) Str::uuid(), 'subject' => "Update $i", 'participants' => ['from' => ['desk@example.test']]])->all();
        $in = ['id' => (string) Str::uuid(), 'subject' => 'New print run', 'participants' => ['from' => [$email]]];
        Http::fake([
            'contacts.hexa-tech.uk/api/integrations/crm-mail/*' => function (Request $req) use ($out, $in) {
                if ($req['action'] === 'list') {
                    return Http::response(['connected' => true, 'total' => 26, 'messages' => $req['page'] === 1 ? $out : [$in]]);
                }

                return $req['message_id'] === $in['id'] ? Http::response([], 502) : Http::response(['body' => 'A staff update.']);
            },
            'api.openai.com/v1/responses' => Http::response($this->providerOutput(['subject' => 'New print run', 'body' => 'Could you confirm the run size?', 'review_notes' => []])),
        ]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.reply.coverage.reply_to.subject', 'New print run')
            ->assertJsonPath('results.reply.coverage.emails', 12)->assertJsonPath('results.reply.coverage.email_state', 'partial')
            ->assertJsonPath('results.reply.coverage.writing_samples', 0)->assertJsonPath('results.reply.coverage.history_limited', true);
        Http::assertSent(fn (Request $req) => $req->url() === 'https://api.openai.com/v1/responses'
            && json_decode($req['input'], true)['conversation']['reply_target']['body'] === '');
    }

    public function test_whatsapp_only_reply_uses_the_latest_customer_text_and_keeps_older_confirmations(): void
    {
        $lead = $this->lead(['brand_id' => $this->brand(23)]);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['phone' => '+32 470 82 60 01']);
        config(['crm_mail.token' => 'fake-crm-mail-token-for-sales-assistant']);
        Http::fake([
            'contacts.hexa-tech.uk/api/integrations/crm-mail/*' => Http::response(['connected' => true, 'messages' => []]),
            'contacts.hexa-tech.uk/api/integrations/crm-whatsapp/*' => Http::sequence()
                ->push(['state' => 'connected', 'has_more' => true, 'messages' => [
                    ['direction' => 'inbound', 'body' => '[image message - open WhatsApp for the original]'],
                    ['direction' => 'outbound', 'body' => 'Desk phrasing'],
                    ['direction' => 'inbound', 'body' => 'Friday please.', 'sent_at' => '2026-11-03T09:00:00Z'],
                ]])->push(['state' => 'connected', 'has_more' => false, 'messages' => [
                    ['direction' => 'inbound', 'body' => 'Already approved the matte finish.', 'sent_at' => '2026-11-02T09:00:00Z'],
                ]]),
            'api.openai.com/v1/responses' => Http::response($this->providerOutput(['subject' => 'Matte proof', 'body' => 'Friday works.', 'review_notes' => []])),
        ]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.reply.coverage.reply_to.channel', 'whatsapp')
            ->assertJsonPath('results.reply.coverage.whatsapp', 3)->assertJsonPath('results.reply.coverage.writing_samples', 2);
        $input = json_decode(Http::recorded()->last()[0]['input'], true);
        $this->assertSame('Friday please.', $input['conversation']['reply_target']['body']);
        $this->assertSame(['Friday please.', 'Already approved the matte finish.'], array_column($input['conversation']['customer_writing_samples'], 'words'));
    }

    public function test_a_failed_amount_check_can_recover_a_useful_scope_reply_and_still_blocks_an_unverified_retry(): void
    {
        $lead = $this->lead(['notes' => "Customer wants a feasibility check before a quote.\nPassword: sample-test-private"]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $writes = 0;
        Http::fake(['api.openai.com/v1/responses' => function (Request $request) use (&$writes) {
            $writes++;
            $this->assertStringNotContainsString('sample-test-private', $request['input']);
            $input = json_decode($request['input'], true);
            if ($writes % 2 === 0) {
                $this->assertStringContainsString('could not be verified', $input['corrections'][0]);
            }
            $body = $input['staff_focus'] === '' && isset($input['corrections']) ? 'We can review the specified finish for your quote.' : 'Your total is USD 9837.';

            return Http::response($this->providerOutput(['decision' => 'draft', 'subject' => 'Finish options',
                'body' => $body, 'review_notes' => [], 'email_language' => 'en', 'commercially_ready' => true]));
        }]);
        $this->asManager()->postJson($path, ['mode' => 'proposal', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertJsonPath('results.proposal.body', 'We can review the specified finish for your quote.');
        $this->postJson($path, ['mode' => 'proposal', 'language' => 'en', 'focus' => 'Review the amount.'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertJsonPath('results.proposal.reason_code', 'unverified_price')->assertJsonPath('results.proposal.body', '');
        $this->assertSame(4, $writes);
        Mail::assertNothingSent();
    }

    public function test_provider_usage_is_recorded_for_an_incomplete_paid_email_generation(): void
    {
        $lead = $this->lead();
        Http::fake(['api.openai.com/v1/responses' => Http::response(['status' => 'incomplete', 'usage' => ['input_tokens' => 1000, 'output_tokens' => 1000]])]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('run.error', 'ai_failed')->assertJsonMissingPath('results.reply');
        $this->assertDatabaseHas('ai_usage_logs', ['model' => 'gpt-6.2-astra', 'feature' => 'crm_sales_assistant', 'cost_cents' => 5]);
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

    public function test_a_reviewed_quote_is_scoped_calculated_and_rechecked_before_reuse(): void
    {
        $lead = $this->lead(['notes' => 'Buyer requested a EUR 40 budget.']);
        $url = fn ($suffix = '') => $this->crmApi("leads/$lead/assistant$suffix?brand_id=all");
        $quote = ['reference' => 'Q-203', 'scope' => 'Three facade samples', 'currency' => 'EUR', 'quantity' => 3,
            'unit_price' => '19.95', 'charges' => '5', 'valid_until' => '2026-11-05', 'tax_basis' => 'excluded'];
        $this->asStaffMember()->putJson($url('/quote'), ['revision' => 0, 'quote' => $quote])->assertForbidden();
        $this->asManager()->putJson($url('/quote'), ['revision' => 0, 'quote' => []])->assertUnprocessable();
        $this->putJson($url('/quote'), ['revision' => 0, 'quote' => $quote])->assertOk()->assertJsonPath('quote.total', '64.85');
        $this->putJson($url('/quote'), ['revision' => 0, 'quote' => null])->assertConflict();
        DB::table('inquiry_attachments')->insert(['organization_id' => $this->org->id, 'inquiry_id' => $lead,
            'filename' => 'drawings.pdf', 'url' => '/private/signed-download?access=fixture', 'note' => 'Received, awaiting engineering review']);
        $draft = ['subject' => 'Facade samples', 'body' => 'The quoted total is €64.85 before tax.', 'review_notes' => []];
        Http::fake(['api.openai.com/v1/responses' => Http::sequence()
            ->push($this->providerOutput([...$draft, 'body' => 'The quoted total is {{quote.total}} before tax.']))->push($this->providerOutput([...$draft, 'body' => 'We can offer EUR 40.']))
            ->push($this->providerOutput($draft))]);
        $this->postJson($url(), ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $response = $this->getJson($url())->assertOk()->assertJsonPath('results.reply.decision', 'draft')->assertJsonPath('results.reply.coverage.project_files', 1);
        $response->assertJsonPath('results.reply.body', 'The quoted total is EUR 64.85 before tax.');
        $id = $response->json('results.reply.id');
        $review = ['mode' => 'reply', 'revision' => 1, 'source_id' => $id, 'subject' => 'Your facade samples', 'body' => 'The three samples come to EUR 64.85 before tax.'];
        $this->asStaffMember()->putJson($url('/review'), $review)->assertForbidden();
        $this->asManager()->putJson($url('/review'), $review)->assertOk()->assertJsonPath('reviews.reply.body', $review['body']);
        $this->putJson($url('/review'), $review)->assertConflict();
        $this->postJson($url(), ['mode' => 'proposal', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($url())->assertOk()->assertJsonPath('results.proposal.reason_code', 'unverified_price')->assertJsonPath('results.proposal.body', '');
        $input = json_decode(Http::recorded()[1][0]['input'], true);
        $evidence = $input['project_evidence'];
        $this->assertSame('64.85', $evidence['approved_quote']['total']);
        $this->assertSame('drawings.pdf', $evidence['lead_files_metadata_only'][0]['filename']);
        $this->assertSame([], $evidence['attachments_in_outgoing_email']);
        $this->assertSame($review['body'], $evidence['approved_writing_examples_this_lead'][0]['reviewed_wording']);
        $this->assertStringNotContainsString('signed-download', json_encode($evidence));
        $this->travel(2)->days();
        $this->getJson($url())->assertOk()->assertJsonPath('results.reply.reason_code', 'quote_changed')
            ->assertJsonPath('results.reply.body', '')->assertJsonMissingPath('reviews.reply');
        $this->postJson($this->adminApi("inquiries/$lead/draft-proposal?brand_id=all"))->assertOk()
            ->assertJsonPath('decision', 'internal_action')->assertJsonPath('body', '');
        $expired = json_decode(Http::recorded()[2][0]['input'], true)['project_evidence']['approved_quote'];
        $this->assertSame('expired', $expired['status']);
        $this->assertArrayNotHasKey('total', $expired);
        Mail::assertNothingSent();
    }

    public function test_follow_up_holds_and_suppression_never_offer_an_email_to_send(): void
    {
        $lead = $this->lead();
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->activity($lead, $this->brandId, 'Please wait until our board meets next month.');
        Http::fake(['api.openai.com/v1/responses' => Http::response($this->providerOutput([
            'decision' => 'wait', 'reason' => 'Their board meets next month.', 'next_step' => 'Revisit after the board meeting.',
            'subject' => 'Discard this', 'body' => 'Checking in early', 'review_notes' => [],
        ]))]);
        $this->asStaffMember()->postJson($path, ['mode' => 'follow_up', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.follow_up.decision', 'wait')->assertJsonPath('results.follow_up.subject', '')
            ->assertJsonPath('results.follow_up.body', '')->assertJsonPath('results.follow_up.reason', 'Their board meets next month.');
        DB::table('inquiries')->where('id', $lead)->update(['status' => 'Lost']);
        $this->postJson($path, ['mode' => 'follow_up', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.follow_up.reason_code', 'declined');
        $contact = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $email = DB::table('guests')->where('id', $contact)->value('email');
        \App\Models\EmailSuppression::create(['email' => $email, 'organization_id' => $this->org->id, 'reason' => 'unsubscribe', 'source' => 'test']);
        $this->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.reply.reason_code', 'suppressed')->assertJsonPath('results.reply.body', '');
        Http::assertSentCount(1);
        Mail::assertNothingSent();
    }

    public function test_multi_project_mail_is_filtered_before_reading_message_bodies(): void
    {
        $brand = $this->brand(23);
        $lead = $this->lead(['brand_id' => $brand]);
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        $email = DB::table('guests')->where('id', $guest)->value('email');
        $other = $this->lead(['guest_id' => $guest, 'brand_id' => $brand]);
        foreach ([[$lead, 'Studio fit-out'], [$other, 'Reception'], [$lead, 'Proposal'], [$other, 'Proposal']] as [$id, $name]) {
            DB::table('activities')->insert(['organization_id' => $this->org->id, 'inquiry_id' => $id, 'brand_id' => $brand,
                'type' => 'email', 'direction' => 'outbound', 'subject' => $name, 'occurred_at' => now()]);
        }
        $ids = [(string) Str::uuid(), (string) Str::uuid(), (string) Str::uuid()];
        $headers = [];
        foreach (['Re: Reception', 'Re: Proposal', 'AW: Studio fit-out'] as $i => $subject) {
            $headers[] = ['id' => $ids[$i], 'participants' => ['from' => [$email]], 'subject' => $subject, 'sent_at' => now()->subHours($i)->toISOString()];
        }
        config(['crm_mail.token' => str_repeat('x', 40)]);
        Http::fake([
            'contacts.hexa-tech.uk/api/integrations/crm-mail/*' => function (Request $req) use ($headers, $ids) {
                if ($req['action'] === 'list') {
                    return Http::response(['connected' => true, 'total' => 3, 'messages' => $headers]);
                }
                $this->assertSame($ids[2], $req['message_id']);

                return Http::response(['body' => 'Could we review the studio drawings?']);
            },
            'api.openai.com/v1/responses' => Http::response($this->providerOutput(['subject' => 'Studio', 'body' => 'Which day suits you?', 'review_notes' => []])),
        ]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asStaffMember()->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertOk()->assertJsonPath('results.reply.coverage.emails', 1)
            ->assertJsonPath('results.reply.coverage.reply_to.subject', 'AW: Studio fit-out')->assertJsonPath('results.reply.coverage.project_history_limited', true);
    }

    public function test_linked_reservations_obey_booking_entitlement_and_the_opportunity_contact(): void
    {
        $id = $this->lead();
        $lead = \App\Models\Inquiry::findOrFail($id);
        $brand = \App\Models\Brand::findOrFail($this->brandId);
        DB::table('reservations')->insert($this->reservationRequired(['organization_id' => $this->org->id,
            'inquiry_id' => $id, 'guest_id' => $lead->guest_id, 'brand_id' => $this->brandId, 'room_type' => 'Studio room']));
        $this->assertSame([], \App\Services\Crm\LeadEmailEvidence::collect($lead, $brand, $this->org)['linked_reservations']);
        $this->org->forceFill(['entitled_products' => null])->save();
        $rows = \App\Services\Crm\LeadEmailEvidence::collect($lead, $brand, $this->org)['linked_reservations'];
        $this->assertSame(['Studio room'], array_column($rows, 'room_type'));
        $this->assertArrayNotHasKey('confirmation_no', $rows[0]);
    }

    public function test_amount_checks_distinguish_currency_tax_and_reviewed_facts_from_a_budget(): void
    {
        $context = ['lead' => ['currency' => 'EUR', 'notes' => 'The buyer requested EUR 520. Approved current fee is EUR 1250.50.'],
            'brand_knowledge' => ['answers' => [], 'documents' => []], 'project_evidence' => []];
        $this->assertTrue(\App\Services\Crm\EmailPriceCheck::supported('The fee is 1 250,50 €.', $context));
        $this->assertFalse(\App\Services\Crm\EmailPriceCheck::supported('We can do this for EUR 520.', $context));
        $this->assertFalse(\App\Services\Crm\EmailPriceCheck::supported('We can do this for USD 1250.50.', $context));
        $quote = ['status' => 'valid', 'currency' => 'EUR', 'charges' => '5', 'subtotal' => '59.85',
            'unit_price' => '19.95', 'total' => '64.85', 'tax_basis' => 'excluded'];
        $context['project_evidence']['approved_quote'] = $quote;
        $this->assertTrue(\App\Services\Crm\EmailPriceCheck::supported('{{quote.total}} before tax.', $context));
        $this->assertFalse(\App\Services\Crm\EmailPriceCheck::supported('{{quote.total}} including VAT.', $context));
        $localized = \App\Services\Crm\LeadQuote::fillAmounts('{{quote.total}}', $quote, 'fr-FR');
        $this->assertMatchesRegularExpression('/64,85\s*€/u', $localized);
        $this->assertNull(\App\Services\Crm\LeadQuote::fillAmounts('We offer {{quote.discount}}.', $quote));
        $this->assertNull(\App\Services\Crm\LeadQuote::fillAmounts('Total {{quote.total}}.', [...$quote, 'status' => 'expired']));
    }

    public function test_brand_knowledge_prioritises_exact_models_and_matches_commercial_topics_across_languages(): void
    {
        $brand = \App\Models\Brand::findOrFail($this->brandId);
        $rows = [
            ['XR-10 limits', 'Outdoor unit only', 10],
            ['XR-1 limits', 'Dry indoor spaces only', 1],
            ['Shipping', 'Allow three days in transit after dispatch.', 1],
            ['Cleaning', 'Use a clean cloth.', 10],
        ];
        foreach ($rows as [$question, $answer, $priority]) {
            DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'brand_id' => $brand->id,
                'question' => $question, 'answer' => $answer, 'priority' => $priority, 'is_active' => true]);
        }
        $service = app(\App\Services\KnowledgeService::class);
        $this->assertSame(['XR-1 limits'], array_column($service->forSales('XR-1', $brand)['answers'], 'question'));
        $this->assertSame(['Shipping'], array_column($service->forSales('Livraison ?', $brand)['answers'], 'question'));
    }

    public function test_a_comment_revises_the_current_edited_email_and_a_fresh_draft_discards_it(): void
    {
        $lead = $this->lead(['notes' => 'Please send an artwork proof.']);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $seen = [];
        Http::fake(['api.openai.com/v1/responses' => function (Request $request) use (&$seen) {
            $ctx = json_decode($request['input'], true);
            $seen[] = $ctx;
            return Http::response($this->providerOutput(['subject' => 'Artwork proof', 'body' => isset($ctx['editable_draft']) ? 'Edited proof reply.' : 'New proof reply.', 'review_notes' => []]));
        }]);
        $base = ['mode' => 'reply', 'language' => 'en'];
        $this->asStaffMember()->postJson($path, $base)->assertAccepted();
        $this->runLatest();
        $original = $this->getJson($path)->json('results.reply');
        $edit = ['source_id' => $original['id'], 'revision' => 0, 'subject' => 'My edited subject', 'body' => 'Please preserve my opening.'];
        $this->postJson($path, $base + ['revise' => $edit])->assertUnprocessable();
        $this->postJson($path, $base + ['focus' => 'Shorten the ending.', 'revise' => $edit])->assertAccepted()
            ->assertJsonMissingPath('run.revise')->assertJsonMissingPath('run.focus');
        $this->runLatest();
        $this->assertSame(['subject' => $edit['subject'], 'body' => $edit['body']], $seen[1]['editable_draft']);
        $this->assertSame('Shorten the ending.', $seen[1]['staff_focus']);
        $this->getJson($path)->assertJsonPath('results.reply.body', 'Edited proof reply.');
        $this->postJson($path, $base + ['focus' => 'Use the old version', 'revise' => $edit])->assertConflict();
        $this->postJson($path, $base + ['focus' => 'Lead with the proof.'])->assertAccepted();
        $this->runLatest();
        $this->assertArrayNotHasKey('editable_draft', $seen[2]);
        $this->assertSame('Lead with the proof.', $seen[2]['staff_focus']);
        $proposal = $this->adminApi("inquiries/$lead/draft-proposal?brand_id=all");
        $handle = $this->asManager()->postJson($proposal)->assertOk()->json('source_id');
        $editing = ['focus' => 'Keep the proof.', 'revise' => ['source_id' => $handle, 'subject' => 'Proof', 'body' => 'Keep my changes.']];
        $this->postJson($proposal, $editing)->assertOk()->assertJsonPath('body', 'Edited proof reply.');
        $other = $this->lead();
        $this->postJson($this->adminApi("inquiries/$other/draft-proposal?brand_id=all"), $editing)->assertConflict();
        Mail::assertNothingSent();
    }

    public function test_kinforge_workflow_checks_nine_needs_against_the_right_brand_and_rejects_an_unhelpful_reply(): void
    {
        // Illustrative approved fixture terms. These rows are created only inside the test transaction.
        $fixture = [
            ['partner_pricing', 'Programme enrolment and referral', 'reseller enrollment referral commission', 'The programme has no joining fee. Qualifying referrals earn 10% commission.'],
            ['partner_pricing', 'Direct purchase pricing for PVC and metal', 'wholesale PVC metal tier', 'Direct purchases receive a 5% discount from the second order.'],
            ['capability', 'Single card artwork', 'single card artwork', 'One card can be made with its own artwork.'],
            ['operations', 'Neutral parcels and invoices', 'blind parcels packing slips', ''],
            ['capability', 'External NFC hosting', 'external NFC hosting', 'We encode your own URL without a hosted profile or subscription.'],
            ['capability', 'Matching QR codes', 'matching QR codes', 'The printed QR can use the same URL as the chip.'],
            ['operations', 'Manual artwork approval', 'manual artwork approval', 'Email the artwork for a proof before production.'],
            ['operations', 'US freight and customs', 'US freight customs', 'Standard US shipping is included.'],
            ['samples', 'Reseller samples and human support', 'reseller samples human support', 'A partner sample pack is available through your reseller contact.'],
        ];
        $lead = $this->lead(['notes' => 'KinForge is a US reseller. We own client relationships, artwork and hosting. Please cover '.implode('; ', array_column($fixture, 1))]);
        $questions = $refs = [];
        foreach ($fixture as $index => [$scope, $need, $words, $answer]) {
            $questions[] = ['need' => $need, 'search' => $index === 6 ? 'customer signoff workflow' : $words, 'alternate' => $words, 'scope' => $scope];
            if ($answer !== '') {
                $refs[$index] = 'faq-'.DB::table('knowledge_items')->insertGetId(['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
                    'question' => $need, 'answer' => $answer, 'is_active' => true]);
            }
        }
        DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'is_active' => true,
            'question' => 'PVC and metal NFC cards retail price', 'answer' => 'The public unit price for a retail card is USD 65.']);
        $other = $this->brand();
        foreach ([[$other, true], [$this->brandId, false]] as [$brand, $active]) {
            DB::table('knowledge_items')->insert(['organization_id' => $this->org->id, 'brand_id' => $brand, 'is_active' => $active,
                'question' => 'Wholesale PVC metal tier', 'answer' => 'Private negotiated 80% discount.']);
        }
        $writes = $reviews = 0;
        $captured = null;
        Http::fake(['api.openai.com/v1/responses' => function (Request $req) use ($fixture, $questions, $refs, &$writes, &$reviews, &$captured) {
            $ctx = json_decode($req['input'], true);
            $bad = $ctx['staff_focus'] === 'Review the integration.';
            $format = $req['text']['format']['name'];
            if ($format === 'crm_email_questions') {
                $data = ['relationship' => 'Manufacturing and reseller partnership', 'customer_workflow' => 'Client-managed artwork, hosting and approval.',
                    'partner_purchase' => true, 'questions' => $questions];
            } elseif ($format === 'crm_email_commercial_review') {
                $reviews++;
                $this->assertArrayHasKey('recent_emails', $ctx);
                $data = ['issues' => $bad ? ['The draft diverts the customer to an unnecessary integration.'] : [],
                    'suggestions' => ['An optional greeting change.']];
            } else {
                $writes++;
                $captured = $ctx;
                $lines = $map = [];
                foreach ($fixture as $index => [$scope, $need, $terms, $answer]) {
                    $pending = match ($index) {3 => 'Check neutral parcels and invoices.', 7 => 'Check who handles customs.', default => ''};
                    $line = trim($answer.' '.$pending);
                    $lines[] = $line;
                    $map[] = ['id' => 'q'.($index + 1), 'status' => $answer === '' ? 'open' : ($pending ? 'partial' : 'confirmed'),
                        'email_excerpt' => $line, 'pending' => $pending, 'evidence' => isset($refs[$index]) ? [['ref' => $refs[$index], 'quote' => $answer]] : []];
                }
                $data = ['decision' => 'draft', 'intent' => 'Reseller partnership', 'subject' => 'Your trial order', 'email_language' => 'en',
                    'body' => implode("\n", $lines).($bad ? "\nIntegrate our builder before we can help." : ''), 'review_notes' => [],
                    'commercial_check' => ['fits_workflow' => true, 'useful_next_step' => true, 'grounded_commitments' => true, 'answers' => $map]];
            }
            return Http::response($this->providerOutput($data));
        }]);
        $path = $this->crmApi("leads/$lead/assistant?brand_id=all");
        $this->asManager()->postJson($path, ['mode' => 'reply', 'language' => 'en'])->assertAccepted();
        $this->runLatest();
        $result = $this->getJson($path)->assertJsonPath('results.reply.decision', 'draft')->json('results.reply');
        $this->assertCount(9, $result['knowledge_trace']['assessment']);
        foreach ($refs as $i => $ref) {
            $this->assertContains($ref, array_column($result['knowledge_trace']['questions'][$i]['matches'], 'id'));
        }
        $this->assertStringNotContainsString('80%', json_encode($captured));
        $this->assertStringNotContainsString('USD 65', json_encode($captured));
        $this->assertSame('open', $result['knowledge_trace']['assessment'][3]['status']);
        $this->assertSame('partial', $result['knowledge_trace']['assessment'][7]['status']);
        $this->postJson($path, ['mode' => 'reply', 'language' => 'en', 'focus' => 'Review the integration.'])->assertAccepted();
        $this->runLatest();
        $this->getJson($path)->assertJsonPath('results.reply.reason_code', 'commercial_review')->assertJsonPath('results.reply.body', '');
        $this->assertSame(3, $writes);
        $this->assertSame(2, $reviews);
        Mail::assertNothingSent();
    }

    public function test_sample_prices_rank_for_the_requested_deliverable_and_only_the_buyers_actual_fallback_counts(): void
    {
        $rows = ['Standard swatch sample' => 'Stock swatch sample, EUR 5.',
            'Assembled enclosure sample' => 'The assembled enclosure proof needs an individual quote.'];
        $ids = [];
        foreach ($rows as $title => $answer) {
            $ids[] = 'faq-'.DB::table('knowledge_items')->insertGetId(['organization_id' => $this->org->id,
                'brand_id' => $this->brandId, 'question' => $title, 'answer' => $answer, 'is_active' => true]);
        }
        $request = 'Please price the assembled enclosure sample. A feasibility answer is enough for now.';
        $input = ['accepted_fallback' => 'A feasibility answer is enough for now.', 'questions' => [
            ['need' => 'What is the prototype charge?', 'scope' => 'samples', 'search' => 'sample',
                'alternate' => 'sample', 'price_subject' => 'assembled enclosure'],
        ]];
        $plan = \App\Services\Crm\EmailQuestionPlan::from($input, $request);
        $brand = \App\Models\Brand::findOrFail($this->brandId);
        $knowledge = app(\App\Services\KnowledgeService::class)->forSalesQuestions($brand, $plan);
        $this->assertSame($input['accepted_fallback'], $knowledge['plan']['accepted_fallback']);
        $this->assertSame($ids[1], $knowledge['plan']['questions'][0]['matches'][0]['id']);
        $this->assertSame('', \App\Services\Crm\EmailQuestionPlan::from($input, 'Please quote the whole order.')['accepted_fallback']);
    }

    public function test_a_referral_percentage_does_not_authorise_a_reseller_discount(): void
    {
        $context = ['brand_knowledge' => ['answers' => [
            ['question' => 'Affiliate referrals', 'answer' => 'Qualifying referrals earn 10% commission.'],
            ['question' => 'Direct orders', 'answer' => 'Resellers receive a 5% discount starting with the second order.'],
        ]]];
        $this->assertTrue(\App\Services\Crm\EmailPriceCheck::supported('From the second order the discount is 5%. Referrals earn 10% commission.', $context));
        $this->assertFalse(\App\Services\Crm\EmailPriceCheck::supported('We offer a 10% discount on your order.', $context));
        $this->assertFalse(\App\Services\Crm\EmailPriceCheck::supported('We offer a 30% commission.', $context));
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
