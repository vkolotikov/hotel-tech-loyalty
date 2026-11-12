<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * Round 5 (2026-11-12), the full admin's features in HexaTech CRM, each fixed in the shared controller:
 *  - a template's preview without a member to fill its tags (a venue on CRM alone has none) renders the template with
 *    the member's tags empty instead of answering 404;
 *  - the assistant's model settings carry the plan's model list (`allowed_models`, null = every model), and a switch to a
 *    model the plan does not include is refused (403 `model_not_allowed`), while a model already saved stays savable.
 * Making templates is a manager's (AccessMap admin/email-templates), and so is changing the model (admin/chatbot-config).
 */
class TemplatesAndModelTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();

        if (!Schema::hasTable('email_templates')) {
            Schema::create('email_templates', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('subject');
                $t->text('html_body');
                $t->text('merge_tags')->nullable();
                $t->string('category')->nullable();
                $t->boolean('is_active')->default(true);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('loyalty_members')) {
            Schema::create('loyalty_members', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('user_id')->nullable();
                $t->unsignedBigInteger('tier_id')->nullable();
                $t->string('member_number')->nullable();
                $t->integer('current_points')->default(0);
                $t->integer('lifetime_points')->default(0);
                $t->string('referral_code')->nullable();
                $t->string('qr_code_token')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
    }

    private function template(): int
    {
        return (int) $this->asManager()->postJson($this->adminApi('email-templates'), [
            'name'      => 'Quote follow-up',
            'subject'   => 'Your quote, {{first_name}}',
            'html_body' => '<p>{{first_name}}, here is your quote from {{hotel_name}} · {{current_year}}</p>',
            'category'  => 'campaign',
        ])->assertCreated()->json('template.id');
    }

    public function test_a_manager_makes_edits_and_deletes_a_template_and_staff_may_only_read(): void
    {
        $id = $this->template();
        $this->assertSame(['{{first_name}}', '{{hotel_name}}', '{{current_year}}'], json_decode((string) DB::table('email_templates')->where('id', $id)->value('merge_tags'), true));

        $this->asManager()->putJson($this->adminApi("email-templates/{$id}"), ['subject' => 'Hello again', 'is_active' => false])
            ->assertOk()->assertJsonPath('template.subject', 'Hello again')->assertJsonPath('template.is_active', false);

        // A category the full admin offers but the server does not take is refused.
        $this->asManager()->postJson($this->adminApi('email-templates'), ['name' => 'B', 'subject' => 'S', 'html_body' => '<p>x</p>', 'category' => 'birthday'])
            ->assertStatus(422)->assertJsonValidationErrors('category');

        $this->asStaffMember()->getJson($this->adminApi('email-templates'))->assertOk()->assertJsonCount(1, 'templates');
        $this->asStaffMember()->postJson($this->adminApi('email-templates'), ['name' => 'Mine', 'subject' => 'S', 'html_body' => '<p>x</p>'])->assertForbidden();
        $this->asStaffMember()->putJson($this->adminApi("email-templates/{$id}"), ['name' => 'Renamed'])->assertForbidden();
        $this->asStaffMember()->deleteJson($this->adminApi("email-templates/{$id}"))->assertForbidden();

        $this->asManager()->deleteJson($this->adminApi("email-templates/{$id}"))->assertOk();
        $this->assertFalse(DB::table('email_templates')->where('id', $id)->exists());
    }

    public function test_the_preview_without_a_member_leaves_the_members_tags_empty_instead_of_failing(): void
    {
        $id = $this->template();

        $preview = $this->asStaffMember()->getJson($this->adminApi("email-templates/{$id}/preview"))->assertOk();
        $preview->assertJsonPath('member', null);
        $this->assertSame('Your quote, ', $preview->json('subject'));
        $this->assertStringNotContainsString('{{', (string) $preview->json('html'));
        $this->assertStringContainsString(date('Y'), (string) $preview->json('html'));
    }

    public function test_the_preview_with_a_member_fills_the_tags_from_that_member(): void
    {
        $id = $this->template();
        if (!Schema::hasTable('loyalty_tiers')) {
            Schema::create('loyalty_tiers', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->integer('min_points')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->softDeletes();
            });
        }
        // An active member with production's NOT NULL columns given.
        $tier = DB::table('loyalty_tiers')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $user = DB::table('users')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Alice Member', 'email' => 'alice.member@example.test', 'password' => 'not-a-real-hash', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_members')->insert(['organization_id' => $this->org->id, 'user_id' => $user, 'tier_id' => $tier, 'member_number' => 'M-001', 'current_points' => 10, 'lifetime_points' => 10, 'qr_code_token' => 'qr-alice-test', 'referral_code' => 'REF-A', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->adminApi("email-templates/{$id}/preview"))
            ->assertOk()->assertJsonPath('member', 'Alice Member')->assertJsonPath('subject', 'Your quote, Alice');
    }

    public function test_the_model_settings_carry_the_plans_model_list(): void
    {
        $this->asManager()->getJson($this->adminApi('chatbot-config/model'))->assertOk()->assertJsonPath('allowed_models', null);

        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'engagement' => 'true', 'ai_allowed_models' => ['gpt-5.6-luna', 'claude-haiku-5-5']]])->save();
        $this->asStaffMember()->getJson($this->adminApi('chatbot-config/model'))
            ->assertOk()->assertJsonPath('allowed_models', ['gpt-5.6-luna', 'claude-haiku-5-5'])->assertJsonPath('model_name', 'gpt-5.5');
    }

    public function test_a_switch_to_a_model_the_plan_lacks_is_refused_and_a_saved_one_stays_savable(): void
    {
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'engagement' => 'true', 'ai_allowed_models' => ['gpt-5.6-luna']]])->save();

        $this->asManager()->putJson($this->adminApi('chatbot-config/model'), ['provider' => 'openai', 'model_name' => 'gpt-5.5'])
            ->assertForbidden()->assertJsonPath('error', 'model_not_allowed');
        $this->assertFalse(DB::table('chatbot_model_configs')->where('organization_id', $this->org->id)->exists());

        $this->asManager()->putJson($this->adminApi('chatbot-config/model'), ['provider' => 'openai', 'model_name' => 'gpt-5.6-luna', 'max_tokens' => 800])
            ->assertOk()->assertJsonPath('model_name', 'gpt-5.6-luna');

        // The plan narrows later: the stored model may still be saved with its other settings, a new one may not.
        DB::table('chatbot_model_configs')->where('organization_id', $this->org->id)->update(['model_name' => 'gpt-4o']);
        $this->asManager()->putJson($this->adminApi('chatbot-config/model'), ['provider' => 'openai', 'model_name' => 'gpt-4o', 'max_tokens' => 900])->assertOk();
        $this->asManager()->putJson($this->adminApi('chatbot-config/model'), ['provider' => 'anthropic', 'model_name' => 'claude-sonnet-5-5'])
            ->assertForbidden()->assertJsonPath('error', 'model_not_allowed');

        // Staff read the settings but do not change them (AccessMap admin/chatbot-config).
        $this->asStaffMember()->putJson($this->adminApi('chatbot-config/model'), ['provider' => 'openai', 'model_name' => 'gpt-5.6-luna'])->assertForbidden();
    }

    public function test_without_a_plan_list_every_model_may_be_chosen(): void
    {
        $this->asManager()->putJson($this->adminApi('chatbot-config/model'), ['provider' => 'anthropic', 'model_name' => 'claude-sonnet-5-5'])
            ->assertOk()->assertJsonPath('model_name', 'claude-sonnet-5-5');
    }
}
