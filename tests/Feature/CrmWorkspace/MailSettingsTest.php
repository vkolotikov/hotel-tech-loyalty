<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The emails' sender in HexaTech CRM (round 5, 2026-11-12): `admin/crm/mail-settings` reads and writes the two keys
 * MailIdentityService reads (`mail_from_name`, `mail_reply_to`) and nothing else, under the full admin's rule for them
 * (an owner; SettingRegistry::ownerOnly), audited as the full admin's settings save audits. A template sent from a lead
 * now carries that identity (before, the platform's MAIL_FROM with no reply-to).
 */
class MailSettingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        config(['admin_access.mode' => 'enforce', 'mail.default' => 'array', 'mail.from.address' => 'noreply@platform.test', 'mail.from.name' => 'Platform']);
        if (!Schema::hasColumn('hotel_settings', 'scope')) {
            Schema::table('hotel_settings', fn (Blueprint $t) => $t->string('scope', 20)->default('company'));
        }
        if (!Schema::hasColumn('organizations', 'email')) {
            Schema::table('organizations', fn (Blueprint $t) => $t->string('email')->nullable());
        }
        $this->org->forceFill(['entitled_products' => ['crm_chat'], 'email' => 'desk@harbour.test'])->save();
    }

    private function asOwner(): static
    {
        $owner = $this->staffUser($this->org, ['role' => 'super_admin']);

        return $this->actingAs($owner, 'sanctum');
    }

    public function test_everyone_reads_the_sender_its_defaults_and_what_an_email_carries(): void
    {
        $read = $this->asStaffMember()->getJson($this->crmApi('mail-settings'))->assertOk();
        $this->assertSame([null, null, 'Harbour Clinic', 'desk@harbour.test', false], [
            $read->json('from_name'), $read->json('reply_to'), $read->json('defaults.from_name'), $read->json('defaults.reply_to'), $read->json('can_change'),
        ]);
        $this->assertSame(['from_name' => 'Harbour Clinic', 'from_address' => 'noreply@platform.test', 'reply_to' => 'desk@harbour.test'], $read->json('identity'));
        $this->assertFalse($this->asManager()->getJson($this->crmApi('mail-settings'))->json('can_change'), 'the full admin gives these keys to an owner');
    }

    public function test_an_owner_changes_them_validated_and_audited_and_nobody_else_does(): void
    {
        $this->asStaffMember()->putJson($this->crmApi('mail-settings'), ['from_name' => 'X', 'reply_to' => null])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asManager()->putJson($this->crmApi('mail-settings'), ['from_name' => 'X', 'reply_to' => null])->assertStatus(403)->assertJsonPath('error', 'owner_only');

        $this->asOwner()->putJson($this->crmApi('mail-settings'), ['from_name' => "Harbour\r\nBcc: x@y.z", 'reply_to' => null])->assertStatus(422)->assertJsonValidationErrors('from_name');
        $this->asOwner()->putJson($this->crmApi('mail-settings'), ['from_name' => 'Harbour', 'reply_to' => 'not an address'])->assertStatus(422)->assertJsonValidationErrors('reply_to');
        $this->assertSame(0, DB::table('hotel_settings')->where('organization_id', $this->org->id)->whereIn('key', ['mail_from_name', 'mail_reply_to'])->count());

        $saved = $this->asOwner()->putJson($this->crmApi('mail-settings'), ['from_name' => 'Harbour Clinic Riga', 'reply_to' => 'Hello@Harbour.test'])->assertOk();
        $this->assertSame(['Harbour Clinic Riga', 'hello@harbour.test', true], [$saved->json('from_name'), $saved->json('reply_to'), $saved->json('can_change')]);
        $this->assertSame(['from_name' => 'Harbour Clinic Riga', 'from_address' => 'noreply@platform.test', 'reply_to' => 'hello@harbour.test'], $saved->json('identity'));
        $rows = DB::table('hotel_settings')->where('organization_id', $this->org->id)->whereIn('key', ['mail_from_name', 'mail_reply_to'])->orderBy('key')->get(['key', 'value', 'group']);
        $this->assertSame([['mail_from_name', 'Harbour Clinic Riga', 'integrations'], ['mail_reply_to', 'hello@harbour.test', 'integrations']], $rows->map(fn ($r) => [$r->key, $r->value, $r->group])->all());
        $this->assertSame(2, DB::table('audit_logs')->where('organization_id', $this->org->id)->where('action', 'setting_updated')->count());

        // Saving the same values writes and audits nothing; an empty one clears it, so the default applies again.
        $this->asOwner()->putJson($this->crmApi('mail-settings'), ['from_name' => 'Harbour Clinic Riga', 'reply_to' => 'hello@harbour.test'])->assertOk();
        $this->assertSame(2, DB::table('audit_logs')->where('organization_id', $this->org->id)->where('action', 'setting_updated')->count());
        $cleared = $this->asOwner()->putJson($this->crmApi('mail-settings'), ['from_name' => '', 'reply_to' => 'hello@harbour.test'])->assertOk();
        $this->assertSame([null, 'Harbour Clinic'], [$cleared->json('from_name'), $cleared->json('identity.from_name')]);
    }

    public function test_another_module_is_refused_and_another_organisations_sender_never_shows(): void
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);
        DB::table('hotel_settings')->insert(['organization_id' => $other->id, 'key' => 'mail_from_name', 'value' => 'Elsewhere Ltd', 'type' => 'string', 'group' => 'integrations', 'created_at' => now(), 'updated_at' => now()]);

        $this->assertNull($this->asStaffMember()->getJson($this->crmApi('mail-settings'))->json('from_name'));

        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();
        $this->asManager()->getJson($this->crmApi('mail-settings'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_a_template_sent_from_a_lead_carries_the_venues_name_and_reply_to(): void
    {
        foreach ([
            'email_templates' => function (Blueprint $t) {
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
            },
            'email_suppressions' => function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable()->index();
                $t->string('email', 191);
                $t->string('reason', 32);
                $t->string('source', 32)->default('manual');
                $t->text('detail')->nullable();
                $t->unsignedSmallInteger('failure_count')->default(1);
                $t->timestamp('last_failed_at')->nullable();
                $t->timestamps();
            },
        ] as $table => $build) {
            if (!Schema::hasTable($table)) {
                Schema::create($table, $build);
            }
        }
        $template = DB::table('email_templates')->insertGetId(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'name' => 'Follow-up', 'subject' => 'Your visit', 'html_body' => '<p>Thank you.</p>', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->asOwner()->putJson($this->crmApi('mail-settings'), ['from_name' => 'Harbour Clinic Riga', 'reply_to' => 'hello@harbour.test'])->assertOk();
        app()->forgetInstance(\App\Services\MailIdentityService::class);

        $this->asStaffMember()->postJson($this->adminApi("email-templates/{$template}/send"), ['to' => 'lead@example.test'])->assertOk();

        $messages = app('mailer')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $sent = $messages[0]->getOriginalMessage();
        $this->assertSame([['noreply@platform.test', 'Harbour Clinic Riga']], array_map(fn ($a) => [$a->getAddress(), $a->getName()], $sent->getFrom()));
        $this->assertSame(['hello@harbour.test'], array_map(fn ($a) => $a->getAddress(), $sent->getReplyTo()));
    }
}
