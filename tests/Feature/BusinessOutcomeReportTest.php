<?php

namespace Tests\Feature;

use App\Services\BusinessOutcomeReport;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class BusinessOutcomeReportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(\Carbon\Carbon::parse('2026-09-11 12:00:00', 'UTC'));
        Schema::create('chat_conversations', function (Blueprint $t) {
            $t->id(); $t->integer('organization_id'); $t->string('page_url'); $t->integer('inquiry_id')->nullable(); $t->string('channel')->nullable();
            $t->string('entry_source_channel')->nullable(); $t->string('entry_source_site')->nullable();
            $t->json('marketing_attribution')->nullable();
        });
        Schema::create('chat_messages', function (Blueprint $t) {
            $t->id(); $t->integer('organization_id'); $t->integer('conversation_id'); $t->string('sender_type'); $t->timestamp('created_at');
        });
        Schema::create('inquiries', function (Blueprint $t) {
            $t->id(); $t->integer('organization_id'); $t->timestamp('created_at'); $t->string('external_source')->nullable();
        });
    }

    public function test_visitor_activity_and_saved_leads_are_distinct_and_tenant_isolated(): void
    {
        foreach ([[1,1,'https://fdscards.lv/?private=secret',1], [2,2,'https://fdscards.lv/',2], [3,1,'https://unowned.test/',3], [4,1,'https://fdscards.lv/',1]] as [$id,$org,$url,$inquiry]) {
            DB::table('chat_conversations')->insert(['id'=>$id,'organization_id'=>$org,'page_url'=>$url,'inquiry_id'=>$inquiry,'channel'=>'widget']);
            DB::table('chat_messages')->insert(['id'=>$id,'organization_id'=>$org,'conversation_id'=>$id,'sender_type'=>'visitor','created_at'=>'2026-09-11 10:00:00']);
        }
        DB::table('chat_messages')->insert([
            ['organization_id'=>1,'conversation_id'=>1,'sender_type'=>'ai','created_at'=>'2026-09-11 10:00:01'],
            ['organization_id'=>1,'conversation_id'=>1,'sender_type'=>'visitor','created_at'=>'2026-09-11 10:01:00'],
            ['organization_id'=>2,'conversation_id'=>1,'sender_type'=>'visitor','created_at'=>'2026-09-11 10:02:00'],
        ]);
        DB::table('inquiries')->insert(['id'=>1,'organization_id'=>1,'created_at'=>'2026-09-11 10:01:00','external_source'=>null]);
        $p = app(BusinessOutcomeReport::class)->build(1);
        $this->assertSame(3, collect($p['rows'])->where('kind','chat_message')->count());
        $this->assertSame(2, collect($p['rows'])->where('kind','chat_started')->count());
        $this->assertSame(1, collect($p['rows'])->where('kind','chat_lead')->count());
        $this->assertStringNotContainsString('secret', json_encode($p));
        $this->assertStringNotContainsString('page_url', json_encode($p));
        DB::table('inquiries')->where('id',1)->update(['external_source'=>'fds_card_builder']);
        $this->assertSame(0, collect(app(BusinessOutcomeReport::class)->build(1)['rows'])->where('kind','chat_lead')->count());
    }

    public function test_old_conversations_do_not_become_new_conversions_when_someone_replies(): void
    {
        DB::table('chat_conversations')->insert(['id'=>1,'organization_id'=>1,'page_url'=>'https://hexa-academy.lv/','channel'=>'widget']);
        DB::table('chat_messages')->insert([
            ['organization_id'=>1,'conversation_id'=>1,'sender_type'=>'visitor','created_at'=>'2025-01-01 10:00:00'],
            ['organization_id'=>1,'conversation_id'=>1,'sender_type'=>'visitor','created_at'=>'2026-09-11 10:00:00'],
        ]);
        $p = app(BusinessOutcomeReport::class)->build(1);
        $this->assertCount(1,$p['rows']);
        $this->assertSame('chat_message',$p['rows'][0]['kind']);
        $this->assertSame('academy-lv',$p['rows'][0]['site']);
    }

    public function test_entry_campaign_is_sanitized_and_later_or_conflicting_sources_are_not_used(): void
    {
        DB::table('inquiries')->insert(['id'=>1, 'organization_id'=>1, 'created_at'=>'2026-09-11 10:01:00']);
        $conversation = new \App\Models\ChatConversation;
        BusinessOutcomeReport::captureEntry($conversation, 'https://fdscards.lv/?utm_source=facebook&utm_medium=paid_social&email=private@example.test');
        $conversation->exists = true;
        BusinessOutcomeReport::captureEntry($conversation, 'https://fdscards.lv/?utm_source=google&utm_medium=cpc');
        $this->assertSame('meta', $conversation->entry_source_channel);
        DB::table('chat_conversations')->insert(['id'=>1,'organization_id'=>1,'page_url'=>'https://fdscards.lv/?utm_source=google&utm_medium=cpc','inquiry_id'=>1,'channel'=>'widget',
            'entry_source_channel'=>$conversation->entry_source_channel,'entry_source_site'=>$conversation->entry_source_site]);
        DB::table('chat_messages')->insert(['organization_id'=>1,'conversation_id'=>1,'sender_type'=>'visitor','created_at'=>'2026-09-11 10:00:00']);
        $p = app(BusinessOutcomeReport::class)->build(1);
        $this->assertSame('meta', collect($p['rows'])->firstWhere('kind','chat_lead')['source_channel']);
        $this->assertStringNotContainsString('private@example.test', json_encode($p));
        DB::table('chat_messages')->update(['created_at'=>'2026-09-11 10:02:00']);
        $this->assertSame('unknown', collect(app(BusinessOutcomeReport::class)->build(1)['rows'])->firstWhere('kind','chat_lead')['source_channel']);
        DB::table('chat_messages')->update(['created_at'=>'2026-09-11 10:00:00']);
        DB::table('chat_conversations')->update(['entry_source_channel'=>null]);
        $this->assertSame('unknown', collect(app(BusinessOutcomeReport::class)->build(1)['rows'])->firstWhere('kind','chat_lead')['source_channel']);
        $other = new \App\Models\ChatConversation;
        BusinessOutcomeReport::captureEntry($other, 'https://fdscards.lv/?fbclid=secret');
        $this->assertSame('social', $other->entry_source_channel);
    }

    public function test_report_requires_its_own_key_and_binds_the_organization_on_server(): void
    {
        Schema::create('business_report_keys', function (Blueprint $t) {
            $t->integer('organization_id'); $t->string('token_hash');
        });
        DB::table('business_report_keys')->insert(['organization_id'=>17,'token_hash'=>hash('sha256',str_repeat('a',64))]);
        $this->getJson('/api/v1/reports/business-outcomes')->assertUnauthorized();
        $this->withToken(str_repeat('b',64))->getJson('/api/v1/reports/business-outcomes')->assertUnauthorized();
        $this->mock(BusinessOutcomeReport::class)->shouldReceive('build')->once()->with(17)->andReturn(['source'=>'chat','rows'=>[]]);
        $this->withToken(str_repeat('a',64))->getJson('/api/v1/reports/business-outcomes?organization_id=999')->assertOk()->assertJsonPath('source','chat');
    }

    public function test_saved_enquiry_exports_only_its_observed_campaigns_before_conversion(): void
    {
        $touch = fn ($channel, $campaign, $time) => ['channel'=>$channel,'campaign_id'=>$campaign,'observed_at'=>$time,'evidence'=>'utm', 'private'=>'secret'];
        DB::table('chat_conversations')->insert(['id'=>1,'organization_id'=>1,'page_url'=>'https://fds-cards.co.uk/?email=private@example.test',
            'inquiry_id'=>1,'channel'=>'widget','entry_source_site'=>'fds-lv','entry_source_channel'=>'meta',
            'marketing_attribution'=>json_encode(['version'=>1,'site'=>'fds-lv','truncated'=>false,'touches'=>[
                $touch('meta','meta-123','2026-09-10T10:00:00Z'), $touch('google','google-456','2026-09-11T09:00:00Z'),
                $touch('chatgpt','too-late','2026-09-11T11:00:00Z'),
            ]])]);
        DB::table('chat_messages')->insert(['organization_id'=>1,'conversation_id'=>1,'sender_type'=>'visitor','created_at'=>'2026-09-11 10:00:00']);
        DB::table('inquiries')->insert(['id'=>1,'organization_id'=>1,'created_at'=>'2026-09-11 10:01:00']);
        $report = app(BusinessOutcomeReport::class)->build(1);
        $lead = collect($report['rows'])->firstWhere('kind','chat_lead');
        $this->assertSame('fds-lv', $lead['site'], 'Resuming on a UK page must not move the original Latvian enquiry.');
        $this->assertSame('google', $lead['source_channel']);
        $this->assertSame(['meta-123','google-456'], array_column($lead['attribution']['touches'],'campaign_id'));
        $this->assertStringNotContainsString('private', json_encode($report['rows']));
        $this->assertStringNotContainsString('too-late', json_encode($report));
        $this->assertArrayNotHasKey('attribution', collect($report['rows'])->firstWhere('kind','chat_message'));
    }
}
