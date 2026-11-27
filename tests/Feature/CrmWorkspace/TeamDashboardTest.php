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
use Tests\Concerns\SetsUpCrmReports;
use Tests\TestCase;

class TeamDashboardTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace, SetsUpCrmReports;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpLeadAssistantTables();
        foreach (['guests' => ['vip_level','mobile','phone','email_consent','marketing_consent','consent_updated_at'], 'inquiries' => ['custom_data','fulfillment_stage','priority','special_requests','last_contacted_at'], 'activities' => ['metadata']] as $table => $columns) {
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

    public function test_day_and_week_growth_use_the_same_elapsed_local_time_and_priority_leads_survive_queue_filters(): void
    {
        foreach (['2026-11-03 22:05','2026-11-04 10:01','2026-11-03 08:00','2026-11-03 20:00','2026-10-28 09:59','2026-10-28 10:01'] as $instant) {
            $this->lead(['created_at' => $instant.':00']);
        }
        $unfiltered = $this->board();
        $this->assertSame(['today' => 1, 'yesterday' => 1, 'week' => 3, 'last_week' => 1, 'day_change' => 0, 'week_change' => 2], $unfiltered['arrivals']);
        $filtered = $this->board('?filter=email&page=7&period=month');
        $this->assertSame($unfiltered['arrivals'], $filtered['arrivals']);
        $this->assertCount(3, $filtered['top_leads']);
        $this->assertSame($unfiltered['top_leads'], $filtered['top_leads']);
        $this->assertCount(3, array_unique(array_column($filtered['top_leads'], 'lead_id')));
        $this->assertArrayNotHasKey('evidence', $filtered['top_leads'][0]);
    }

    public function test_portfolio_countries_converted_values_followups_and_comparison_share_the_visible_leads(): void
    {
        $this->org->forceFill(['currency' => 'EUR'])->saveQuietly();
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
        $this->assertSame(['EUR', '240.00', 3], [$book['total_value']['currency'], $book['total_value']['amount'], $book['total_value']['valued']]);
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

    public function test_customer_waits_are_distinct_and_the_oldest_reply_stays_visible_alongside_urgent_leads(): void
    {
        $old = $this->lead();
        $last = $this->activity($old, ['occurred_at' => now()->subDays(14)]);
        $this->activity($old, ['subject' => 'Separate question', 'occurred_at' => now()->subDays(8)]);
        foreach (range(1, 4) as $n) {
            $lead = $this->lead(['priority' => 'High', 'custom_data' => '{"deadline":"2026-11-05"}']);
            $this->activity($lead, ['occurred_at' => now()->subHours(3)]);
        }
        $edge = $this->lead();
        $this->activity($edge, ['occurred_at' => now()->subDays(7)->addSecond()]);
        $board = $this->board('?period=month&filter=waiting_week');
        $this->assertSame([6, 1, 0], array_values(array_intersect_key($board['attention'], array_flip(['needed','waiting_week','checkin']))));
        $this->assertSame([$old], array_column($board['actions'], 'lead_id'));
        $this->assertSame([(string) $last, 14], [$board['actions'][0]['message_id'], $board['actions'][0]['age_days']]);
        $this->assertSame($old, $board['attention']['top'][2]['lead_id']);
        $this->assertCount(3, array_unique(array_column($board['attention']['top'], 'lead_id')));
        $this->activity($old, ['subject' => 'Re: Artwork', 'direction' => 'outbound', 'occurred_at' => now()]);
        $this->travel(61)->seconds();
        $this->assertSame(2, $this->board('?filter=waiting_week')['matching']);
        $this->assertSame('Separate question', $this->board('?filter=waiting_week')['actions'][0]['subject']);
    }

    public function test_untouched_leads_remain_actionable_across_weeks_until_first_contact_or_a_scheduled_task(): void
    {
        $old = ['created_at' => now()->subDays(18)];
        $waiting = $this->lead($old);
        $this->lead($old + ['next_task_due' => now()->addDays(2)]);
        $called = $this->lead($old);
        $this->activity($called, ['type' => 'call', 'direction' => 'outbound']);
        $this->lead($old + ['status' => 'Lost']);
        $new = $this->board('?filter=new');
        $this->assertSame([$waiting], array_column($new['actions'], 'lead_id'));
        $this->assertSame(18, $new['attention']['top'][0]['age_days']);
        $this->assertSame(0, $new['attention']['waiting_week']);
        $this->activity($waiting, ['direction' => 'outbound', 'occurred_at' => now()]);
        $this->travel(61)->seconds();
        $this->assertSame(0, $this->board('?filter=new')['matching']);
    }

    public function test_checkins_use_last_sent_email_and_honour_replies_tasks_other_channels_and_contact_preferences(): void
    {
        $send = function (array $attrs = [], int $days = 7) {
            $id = $this->lead($attrs);
            $msg = $this->activity($id, ['direction' => 'outbound', 'occurred_at' => now()->subDays($days)]);
            return [$id, $msg];
        };
        [$eligible, $msg] = $send(['priority' => 'High']);
        [$due] = $send(['next_task_due' => now()->subDay()]);
        [$reply] = $send();
        $this->activity($reply, ['subject' => 'Re: Artwork']);
        $send([], 6);
        $send(['status' => 'Confirmed']);
        $send(['status' => 'Lost']);
        $send(['status' => 'Declined']);
        $send(['last_contacted_at' => now()->subDays(3)]);
        $send(['next_task_due' => now()->addDay()]);
        [$call] = $send();
        $this->activity($call, ['type' => 'call', 'direction' => 'outbound']);
        [$resend] = $send();
        $this->activity($resend, ['subject' => 'New details', 'direction' => 'outbound']);
        [$unsub] = $send();
        $g = DB::table('inquiries')->where('id', $unsub)->value('guest_id');
        DB::table('guests')->where('id', $g)->update(['email_consent' => false, 'consent_updated_at' => now()]);
        [$bounce] = $send();
        $email = DB::table('guests')->where('id', DB::table('inquiries')->where('id', $bounce)->value('guest_id'))->value('email');
        \App\Models\EmailSuppression::suppress($email, \App\Models\EmailSuppression::HARD_BOUNCE);
        $view = $this->board('?filter=checkin');
        $this->assertEqualsCanonicalizing([$eligible,$due], array_column($view['actions'], 'lead_id'));
        $this->assertSame(2, $view['attention']['checkin']);
        $this->assertSame(2, $view['attention']['needed']);
        $entry = collect($view['actions'])->firstWhere('lead_id', $eligible);
        $this->assertSame(['activity',(string) $msg,7], [$entry['source'],$entry['message_id'],$entry['age_days']]);
        $this->assertSame(1, collect($this->board()['actions'])->where('lead_id', $due)->count());
        $this->assertStringNotContainsString('"outreach"', json_encode($view));
    }

    public function test_customer_ranking_groups_linked_companies_converts_won_value_and_scopes_legacy_deals(): void
    {
        $this->setUpCrmReports();
        $this->org->forceFill(['currency' => 'EUR'])->saveQuietly();
        $company = $this->company('North Studio');
        $win = function (array $attrs, ?string $date, string $name = 'Independent') {
            $id = $this->lead($attrs + ['status' => 'Confirmed'], $name);
            if ($date) $this->activity($id, ['type' => 'status_change', 'metadata' => '{"kind":"won"}', 'occurred_at' => $date]);
            return $id;
        };
        $date = '2026-11-03 12:00:00';
        $first = $win(['corporate_account_id' => $company, 'total_value' => 125, 'currency' => 'USD'], $date);
        $this->activity($first, ['type' => 'status_change', 'metadata' => '{"kind":"won"}']);
        $win(['corporate_account_id' => $company, 'total_value' => 85, 'currency' => 'EUR'], $date);
        $win(['corporate_account_id' => $company, 'total_value' => 900, 'currency' => 'XXX'], $date);
        $win(['total_value' => 170, 'currency' => 'EUR'], $date);
        $win([], $date);
        $win(['total_value' => 600, 'currency' => 'EUR'], null, 'Legacy');
        $win(['total_value' => 300, 'currency' => 'EUR'], '2026-11-01 07:00:00', 'Earlier');
        $this->lead(['total_value' => 5000, 'currency' => 'EUR', 'corporate_account_id' => $company]);
        $other = Brand::create(['organization_id' => $this->org->id, 'name' => 'North', 'slug' => 'north-rank', 'widget_token' => str()->random(32)]);
        $win(['brand_id' => $other->id, 'total_value' => 9999, 'currency' => 'EUR'], null, 'Hidden');
        $this->staffMember->brands()->attach($this->brandId);
        $get = fn ($period) => $this->asStaffMember()->getJson($this->crmApi('team-customers?brand_id=all&period='.$period))->assertOk()->json();
        $week = $get('week');
        $this->assertSame(3, $week['total']);
        $this->assertSame(['type' => 'company','id' => $company,'name' => 'North Studio','company' => '','wins' => 3,'amount' => '185.00','currency' => 'EUR','converted' => true,'valued' => 2], $week['rows'][0]);
        $this->assertSame(['North Studio','Independent','Independent'], array_column($week['rows'], 'name'));
        $this->assertNull($week['rows'][2]['amount']);
        $this->assertSame('Earlier', $get('month')['rows'][0]['name']);
        $all = $get('all');
        $this->assertSame([5, 'Legacy'], [$all['total'], $all['rows'][0]['name']]);
        $this->getJson($this->crmApi('team-customers?period=yesterday'))->assertUnprocessable();
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
        $this->assertSame([$order], array_column($second['attention']['top'], 'lead_id'));
        Queue::assertPushed(ReviewTeamPriorities::class, 1);
        Http::assertSentCount(1);
    }
}
