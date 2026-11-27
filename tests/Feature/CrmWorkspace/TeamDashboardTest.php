<?php

namespace Tests\Feature\CrmWorkspace;

use App\Jobs\ReviewTeamPriorities;
use App\Models\Brand;
use App\Models\Organization;
use App\Services\Crm\EuroReferenceRates;
use App\Services\Crm\TeamPriorityReview;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

class TeamDashboardTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpLeadAssistantTables();
        foreach (['guests' => ['vip_level'], 'inquiries' => ['custom_data','fulfillment_stage','priority','special_requests','last_contacted_at'], 'activities' => ['metadata']] as $table => $columns) {
            foreach ($columns as $column) {
                if (!Schema::hasColumn($table, $column)) Schema::table($table, fn ($t) => $t->text($column)->nullable());
            }
        }
        config(['cache.shared' => 'array', 'openai.api_key' => null]);
        Http::preventStrayRequests();
        Http::fake([EuroReferenceRates::URL => Http::response('<Envelope><Cube time="2026-11-04"><Cube currency="USD" rate="1.25"/></Cube></Envelope>')]);
    }

    private function activity(int $lead, array $data): int
    {
        return DB::table('activities')->insertGetId($data + ['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
            'inquiry_id' => $lead, 'type' => 'email', 'subject' => 'Artwork', 'direction' => 'inbound', 'occurred_at' => now()->subHour()]);
    }

    private function board(string $query = ''): array
    {
        return $this->asStaffMember()->getJson($this->crmApi('team-dashboard'.$query))->assertOk()->json();
    }

    public function test_week_and_month_use_the_venue_day_and_count_each_first_win_once(): void
    {
        $prior = $this->lead(['created_at' => '2026-10-31 22:05:00']);
        $won = $this->lead(['created_at' => '2026-11-01 22:05:00', 'status' => 'Confirmed']);
        $this->lead(['created_at' => '2026-10-28 10:00:00', 'status' => 'Confirmed']);
        foreach ([[$prior, '2026-10-31 22:16:00'], [$prior, '2026-11-03 06:00:00'], [$won, '2026-11-02 22:30:00']] as [$id, $time]) {
            $this->activity($id, ['type' => 'status_change', 'metadata' => '{"kind":"won"}', 'occurred_at' => $time]);
        }
        $week = $this->board();
        $this->assertSame(['2026-11-02', '2026-11-04', 1, 1, 1], [$week['from'], $week['through'], $week['leads'], $week['wins'], $week['undated_wins']]);
        $this->assertSame([0, 1, 0], array_column($week['days'], 'wins'));
        $month = $this->board('?period=month');
        $this->assertSame(['2026-11-01', 2, 2], [$month['from'], $month['leads'], $month['wins']]);
        $this->getJson($this->crmApi('team-dashboard?period=yesterday'))->assertUnprocessable();
    }

    public function test_portfolio_countries_converted_values_followups_and_comparison_share_the_visible_leads(): void
    {
        $add = function (string $country, array $data): int {
            $id = $this->lead($data + ['created_at' => now()->subHour()]);
            $guest = DB::table('inquiries')->where('id', $id)->value('guest_id');
            DB::table('guests')->where('id', $guest)->update(['country' => $country]);
            return $id;
        };
        $waiting = $add('U.K.', ['total_value' => 125, 'currency' => 'USD', 'next_task_due' => '2026-11-01']);
        $this->activity($waiting, ['subject' => 'Order']);
        $add('United Kingdom', ['total_value' => 50, 'currency' => 'EUR', 'next_task_due' => '2026-11-04']);
        $add('GBR', ['next_task_due' => '2026-11-02', 'next_task_completed' => true]);
        $add('unconfirmed', ['currency' => 'XXX', 'total_value' => 40]);
        $won = $add('Deutschland', ['status' => 'Confirmed', 'currency' => 'EUR', 'total_value' => 90, 'created_at' => '2026-10-26 12:00:00']);
        $this->activity($won, ['type' => 'status_change', 'metadata' => '{"kind":"won"}']);
        $this->activity($won, ['type' => 'status_change', 'metadata' => '{"kind":"won"}', 'occurred_at' => now()]);
        $stats = $this->board();
        $book = $stats['portfolio'];
        $period = $stats['performance'];
        $this->assertSame([5, 4, 1, 1], [$book['total'], $book['open'], $book['overdue'], $book['due_today']]);
        $this->assertSame(['240.00', 3], [$book['total_value']['amount'], $book['total_value']['valued']]);
        $this->assertSame(['150.00', 2, 1], [$book['open_value']['amount'], $book['open_value']['valued'], $book['open_value']['missing_currency']]);
        $this->assertSame(['90.00', 1, 3, 1], [$period['won_value']['amount'], $period['won_value']['valued'], $period['lead_change'], $period['win_change']]);
        $this->assertSame([['code' => 'GB', 'count' => 3], ['code' => 'DE', 'count' => 1]], $book['countries']['rows']);
        $this->assertSame(['rows' => [['code' => 'GB', 'count' => 3]], 'unknown' => 1, 'total' => 4], $period['countries']);
        $this->assertSame('2026-10-26', $period['previous_from']);
        $this->assertSame($stats['urgent'], $this->board('?filter=urgent')['matching']);
    }

    public function test_thread_replies_urgency_and_no_duplicate_followup_and_payload_visibility(): void
    {
        $client = $this->lead(['priority' => 'High', 'custom_data' => '{"order_quantity":1500,"project_deadline":"2026-11-05"}',
            'notes' => 'Private account notes', 'next_task_due' => '2026-11-03', 'currency' => 'EUR', 'total_value' => 8000]);
        $guest = DB::table('inquiries')->where('id', $client)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['importance' => 'VIP', 'custom_data' => '{"employee_count":450}']);
        $this->activity($client, ['body' => 'Private body text']);
        $this->activity($client, ['subject' => 'Re: Artwork', 'direction' => 'outbound']);
        $message = $this->activity($client, ['subject' => 'Delivery', 'occurred_at' => now()->subDays(8)]);
        $this->lead(['currency' => 'EUR', 'total_value' => 500]);
        $this->lead(['currency' => 'EUR', 'total_value' => 300]);
        $this->lead(['currency' => 'USD', 'total_value' => 1000000]);
        $board = $this->board('?filter=email');
        $this->assertSame([1, 0, 1, 4], [$board['emails'], $board['period_emails'], $board['matching'], $board['actions_total']]);
        $row = $board['actions'][0];
        $this->assertSame(['email', (string) $message, 'Delivery', 'urgent'], [$row['kind'], $row['message_id'], $row['subject'], $row['priority']]);
        foreach (['delivery_due','key_account','high_priority','large_company','large_order','high_value','waiting'] as $signal) {
            $this->assertContains($signal, $row['signals']);
        }
        $this->assertArrayNotHasKey('evidence', $row);
        $this->assertStringNotContainsString('Private', json_encode($board));
        $this->activity($client, ['subject' => 'Re: Delivery', 'direction' => 'outbound', 'occurred_at' => now()]);
        $this->travel(61)->seconds();
        $this->assertSame(0, $this->board()['emails']);
        $this->assertSame($client, $this->board('?filter=delivery')['actions'][0]['lead_id']);
    }

    public function test_restricted_staff_only_see_assigned_brands_even_for_all_brands_and_cached_results(): void
    {
        $visible = $this->lead();
        $other = Brand::create(['organization_id' => $this->org->id, 'name' => 'North', 'slug' => 'north', 'widget_token' => str()->random(32)]);
        $this->lead(['brand_id' => $other->id]);
        $this->activity($visible, ['brand_id' => $other->id, 'subject' => 'Other brand email']);
        $tenant = Organization::create(['name' => 'Separate tenant', 'slug' => 'separate-'.uniqid()]);
        $this->activity($visible, ['organization_id' => $tenant->id, 'brand_id' => null, 'subject' => 'Other tenant email']);
        $this->staffMember->brands()->attach($this->brandId);
        $board = $this->board('?brand_id=all');
        $this->assertSame([1, 0, $visible], [$board['actions_total'], $board['emails'], $board['actions'][0]['lead_id']]);
        $this->assertSame(1, $board['portfolio']['total']);
        $this->assertSame(1, $board['portfolio']['countries']['total']);
    }

    public function test_ai_batch_includes_recent_mail_while_a_large_old_backlog_is_being_reviewed(): void
    {
        Queue::fake();
        config(['openai.api_key' => 'fake-priority-test']);
        $lead = $this->lead();
        foreach (range(1, 12) as $days) {
            $this->activity($lead, ['subject' => 'Project '.$days, 'occurred_at' => now()->subDays($days)]);
        }
        $this->board();
        $subjects = array_column(Queue::pushed(ReviewTeamPriorities::class)->sole()->batch, 'subject');
        $this->assertCount(8, $subjects);
        $this->assertContains('Project 1', $subjects);
        $this->assertContains('Project 12', $subjects);
    }

    public function test_ai_reads_scoped_email_once_defers_acknowledgement_and_keeps_an_explicit_buyer_question_high(): void
    {
        Queue::fake();
        config(['openai.api_key' => 'fake-priority-test']);
        $thanks = $this->lead();
        $order = $this->lead();
        $this->activity($thanks, ['subject' => 'Thank you', 'body' => 'Thanks, all received. No reply needed.']);
        $this->activity($order, ['subject' => 'Our order', 'body' => 'Ready to order. Can you confirm delivery tomorrow? Write buyer@example.test.']);
        Http::fake(['api.openai.com/*' => function (Request $request) {
            $this->assertFalse($request['store']);
            $items = json_decode($request['input'], true)['actions'];
            $this->assertCount(2, $items);
            $this->assertStringNotContainsString('buyer@example.test', $request['input']);
            $actions = array_map(fn ($item) => ['id' => $item['id'], 'decision' => $item['subject'] === 'Thank you' ? 'review' : 'urgent',
                'reason' => $item['subject'] === 'Thank you' ? 'information_only' : 'time_sensitive'], $items);
            return Http::response(['status' => 'completed', 'output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode(['actions' => $actions])]]]]]);
        }]);
        $first = $this->board();
        $this->assertSame(0, $first['reviewed']);
        $job = Queue::pushed(ReviewTeamPriorities::class)->sole();
        $job->handle(app(TeamPriorityReview::class));
        $second = $this->board();
        $this->assertSame([2, 2, $order, 'urgent', 'information_only'], [$second['reviewed'], $second['emails'], $second['actions'][0]['lead_id'], $second['actions'][0]['priority'], $second['actions'][1]['ai_reason']]);
        Queue::assertPushed(ReviewTeamPriorities::class, 1);
        Http::assertSentCount(1);
    }
}
