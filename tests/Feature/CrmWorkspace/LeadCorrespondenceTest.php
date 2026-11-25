<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Brand;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Services\Crm\LeadCorrespondenceSync;
use App\Services\Crm\LeadReplyBadges;
use App\Services\Integrations\CrmMail;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class LeadCorrespondenceTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private array $email;
    private array $wa;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildCrmWorkspaceTables();
        $this->setUpLeadAssistantTables();
        if (! Schema::hasColumn('guests', 'mobile')) {
            Schema::table('guests', fn ($table) => $table->string('mobile')->nullable());
        }
        if (! Schema::hasTable('crm_correspondence_syncs')) {
            (require database_path('migrations/2026_11_25_210000_create_crm_correspondence_syncs.php'))->up();
        }
        $this->org = new Organization(['name' => 'Capture fixtures', 'slug' => 'fds-auto-test']);
        $this->org->forceFill(['id' => CrmMail::ORGANIZATION])->saveQuietly();
        app()->instance('current_organization_id', $this->org->id);
        $this->brandId = CrmMail::BRAND;
        foreach ([$this->brandId, 80000023] as $id) {
            $brand = new Brand(['organization_id' => $this->org->id, 'name' => 'Brand '.$id, 'slug' => 'capture-'.$id]);
            $brand->forceFill(['id' => $id, 'widget_token' => str()->random(32)])->saveQuietly();
        }
        $this->staffMember = $this->staffUser($this->org, ['role' => 'staff']);
        $this->travelTo(now()->startOfMinute());
        config(['crm_mail.token' => str_repeat('t', 40)]);
        Http::preventStrayRequests();
        $this->email = ['threads' => [$this->thread('Artwork', 'inbound')], 'snapshot_at' => now()->toISOString(), 'next_cursor' => null];
        $this->wa = ['state' => 'connected', 'threads' => [$this->thread('Chat', 'outbound')]];
        Http::fake([
            '*/crm-mail/*' => function (Request $r) {
                $this->assertSame('capture', $r['action']);
                return Http::response($this->email, $this->email['http_status'] ?? 200);
            },
            '*/crm-whatsapp/*' => function (Request $r) {
                $this->assertTrue($r['summary']);
                return Http::response($this->wa);
            },
        ]);
    }

    private function thread(string $subject, string $direction): array
    {
        return ['subject_key' => hash('sha256', strtolower($subject)), 'message_id' => $subject.'-'.$direction, 'direction' => $direction, 'at' => now()->toISOString()];
    }

    private function badges(int $id): ?array
    {
        $lead = Inquiry::with('guest')->findOrFail($id);
        LeadReplyBadges::attach(collect([$lead]), $this->staffMember);

        return $lead->reply_status;
    }

    public function test_background_capture_tracks_channels_and_threads_independently_and_preserves_stage(): void
    {
        $lead = $this->lead();
        $guest = DB::table('inquiries')->where('id', $lead)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['mobile' => '+44 7700 900123']);
        $this->lead(['brand_id' => 80000023]);
        $this->artisan('crm:sync-lead-correspondence')->expectsOutput('Contacts checked: 1')->assertSuccessful();
        $this->assertSame(['email' => 'needs_reply', 'whatsapp' => 'awaiting_customer'], $this->badges($lead));
        $record = Inquiry::with('guest')->findOrFail($lead);
        $page = LeadReplyBadges::emailPage($record->guest, $record, ['connected' => true, 'messages' => [['id' => 'Artwork-inbound'], ['id' => 'older']]]);
        $this->assertSame('needs_reply', $page['messages'][0]['reply_status']);
        $this->assertArrayNotHasKey('reply_status', $page['messages'][1]);
        $this->assertSame(0, app(LeadCorrespondenceSync::class)->run());
        $this->email['threads'][] = $this->thread('Delivery', 'outbound');
        $this->wa['threads'] = [$this->thread('Chat', 'inbound')];
        $this->travel(6)->minutes();
        app(LeadCorrespondenceSync::class)->run();
        $this->assertSame(['email' => 'needs_reply', 'whatsapp' => 'needs_reply'], $this->badges($lead));
        $this->email['threads'][0] = $this->thread('Artwork', 'outbound');
        $this->travel(6)->minutes();
        app(LeadCorrespondenceSync::class)->run();
        $this->assertSame(['email' => 'awaiting_customer', 'whatsapp' => 'needs_reply'], $this->badges($lead));
        $this->assertSame('New', DB::table('inquiries')->where('id', $lead)->value('status'));
        DB::table('guests')->where('id', $guest)->update(['email' => 'changed@example.test', 'mobile' => null]);
        $this->assertNull($this->badges($lead));
        Http::assertSentCount(6);
    }

    public function test_paging_transient_failures_and_lost_matches_do_not_clear_or_leak_reply_state(): void
    {
        $lead = $this->lead();
        $this->email['next_cursor'] = 'opaque-page-two';
        $sync = app(LeadCorrespondenceSync::class);
        $sync->run();
        $this->travel(2)->minutes();
        $this->email = ['http_status' => 502];
        $sync->run();
        $this->assertSame('needs_reply', $this->badges($lead)['email']);
        Http::assertSent(fn (Request $r) => $r['cursor'] === 'opaque-page-two');
        $this->travel(2)->minutes();
        $this->email = ['http_status' => 409];
        $sync->run();
        $this->assertNull($this->badges($lead));
    }

    public function test_a_shared_contact_requires_an_exclusive_project_subject_and_brand_access(): void
    {
        $one = $this->lead();
        $guest = DB::table('inquiries')->where('id', $one)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['phone' => '+44 7700 900123']);
        $two = $this->lead(['guest_id' => $guest]);
        $this->email['threads'][] = $this->thread('Delivery', 'outbound');
        app(LeadCorrespondenceSync::class)->run();
        $this->assertNull($this->badges($one));
        foreach ([[$one, 'RE: Artwork'], [$two, 'Delivery']] as [$lead, $subject]) {
            DB::table('activities')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'inquiry_id' => $lead,
                'guest_id' => $guest, 'type' => 'email', 'subject' => $subject, 'occurred_at' => now()]);
        }
        $this->assertSame(['email' => 'needs_reply'], $this->badges($one));
        $this->assertSame(['email' => 'awaiting_customer'], $this->badges($two));
        DB::table('brand_user')->insert(['brand_id' => 80000023, 'user_id' => $this->staffMember->id]);
        $this->assertNull($this->badges($one));
    }
}
