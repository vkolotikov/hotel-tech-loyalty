<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The AI capture is every CRM staff member's (owner, 2026-11-08: "add ai capture in leads and deals for any staff
 * member"): `crm-ai/capture-*` answers an organisation whose CRM workspace is on without the staff AI (`admin_ai`), as
 * well as a plan with it; the rest of `crm-ai/*` keeps `feature:admin_ai`. A failure answers our sentence, never the
 * provider's text.
 */
class AiCaptureTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private const MESSAGE = 'Hello, we are a group of 12 and would like a quote for a team day on 14 May. Anna Berzina, anna@example.test';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        // The organisation's lists the capture's prompt names (sources, types, room types).
        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->timestamps();
            });
        }
        config(['services.anthropic.api_key' => 'test-key-not-real', 'services.anthropic.model' => 'claude-sonnet-test']);
        // The CRM's own packages: the chatbot and the visitor feed, no staff AI.
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'engagement' => 'true', 'ai_monthly_cost_cents' => '1000']])->save();
    }

    private function readsALead(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-test',
                'content' => [['type' => 'tool_use', 'id' => 'toolu_test', 'name' => 'save_extracted_inquiry', 'input' => ['customer_name' => 'Anna Berzina', 'email' => 'anna@example.test']]],
                'stop_reason' => 'tool_use',
                'usage' => ['input_tokens' => 120, 'output_tokens' => 30],
            ], 200),
        ]);
    }

    public function test_any_staff_member_of_a_crm_without_the_staff_ai_may_capture_a_lead(): void
    {
        $this->readsALead();

        $this->asStaffMember()->postJson($this->adminApi('crm-ai/capture-lead'), ['text' => self::MESSAGE])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.customer_name', 'Anna Berzina');

        // The spend is the organisation's allowance's.
        $this->assertSame(1, DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->count());
        // The bootstrap says the same, so the button shows.
        $this->asStaffMember()->getJson($this->crmApi('bootstrap'))->assertOk()->assertJsonPath('features.ai_capture', true);
    }

    public function test_an_organisation_with_the_crm_switched_off_and_no_staff_ai_is_refused(): void
    {
        $this->readsALead();
        $this->org->forceFill(['settings' => ['workspaces' => ['crm' => ['enabled' => false]]]])->save();

        foreach (['capture-lead', 'capture-guest', 'capture-corporate', 'capture-member'] as $path) {
            $this->asStaffMember()->postJson($this->adminApi("crm-ai/{$path}"), ['text' => self::MESSAGE])
                ->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        }
        Http::assertNothingSent();

        // A plan with the staff AI keeps the capture in the full admin.
        $this->org->forceFill(['plan_features' => ['admin_ai' => 'true']])->save();
        $this->staffMember->unsetRelation('organization');
        $this->asStaffMember()->postJson($this->adminApi('crm-ai/capture-lead'), ['text' => self::MESSAGE])
            ->assertOk()->assertJsonPath('success', true);
    }

    public function test_the_staff_ais_chat_still_needs_the_plan(): void
    {
        Http::fake();

        $this->asManager()->postJson($this->adminApi('crm-ai/chat'), ['messages' => [['role' => 'user', 'content' => 'Hello']]])
            ->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        Http::assertNothingSent();
    }

    public function test_a_provider_failure_answers_our_sentence_not_the_providers_text(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response('{"type":"error","error":{"type":"invalid_request_error","message":"secret detail from the provider"}}', 400),
        ]);

        $answer = $this->asStaffMember()->postJson($this->adminApi('crm-ai/capture-lead'), ['text' => self::MESSAGE])
            ->assertOk()->assertJsonPath('success', false)->json('error');

        $this->assertStringNotContainsString('secret detail', (string) $answer);
        $this->assertStringNotContainsString('API error', (string) $answer);
        $this->assertNotSame('', trim((string) $answer));
    }
}
