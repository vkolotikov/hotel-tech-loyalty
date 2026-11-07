<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * `POST email-templates/{id}/send` to someone who is no member (a lead; 2026-11-08): the member's tags are left empty.
 * Before, the endpoint filled them from the first active member it found, so a lead received another person's name,
 * email, card number, points and referral code.
 */
class SendTemplateTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private int $template;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        config(['mail.default' => 'array']);

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

        // The suppression list every send checks.
        if (!Schema::hasTable('email_suppressions')) {
            Schema::create('email_suppressions', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable()->index();
                $t->string('email', 191);
                $t->string('reason', 32);
                $t->string('source', 32)->default('manual');
                $t->text('detail')->nullable();
                $t->unsignedSmallInteger('failure_count')->default(1);
                $t->timestamp('last_failed_at')->nullable();
                $t->timestamps();
            });
        }

        // An active member of this organisation, who is not the person written to.
        $user = DB::table('users')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Alice Member', 'email' => 'alice.member@example.test', 'password' => 'not-a-real-hash', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_members')->insert(['organization_id' => $this->org->id, 'user_id' => $user, 'member_number' => 'GOLD-001', 'current_points' => 1500, 'lifetime_points' => 5200, 'referral_code' => 'REF-ALICE', 'qr_code_token' => 'qr-alice-test', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->template = DB::table('email_templates')->insertGetId([
            'organization_id' => $this->org->id,
            'brand_id'        => $this->brandId,
            'name'            => 'Welcome',
            'subject'         => 'Hello {{first_name}}',
            'html_body'       => '<p>{{member_name}} · {{email}} · {{member_number}} · {{points_balance}} · {{referral_code}} · {{current_year}}</p>',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    public function test_a_template_sent_to_someone_who_is_no_member_carries_no_members_details(): void
    {
        $this->asStaffMember()->postJson($this->adminApi("email-templates/{$this->template}/send"), ['to' => 'lead@example.test'])
            ->assertOk();

        $messages = app('mailer')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $sent = $messages[0]->getOriginalMessage();
        $html = (string) $sent->getHtmlBody();
        foreach (['Alice', 'alice.member@example.test', 'GOLD-001', '1,500', 'REF-ALICE', '{{'] as $leak) {
            $this->assertStringNotContainsString($leak, $html . ' ' . $sent->getSubject(), "the email must not carry {$leak}");
        }
        $this->assertStringContainsString(date('Y'), $html);
        $this->assertSame('lead@example.test', $sent->getTo()[0]->getAddress());
    }
}
