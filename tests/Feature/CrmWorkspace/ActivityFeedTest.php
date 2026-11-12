<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpCrmReports;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * HexaTech CRM's team activity on Today (round 5, owner 2026-11-12): `GET crm/activity`, the newest lines of the leads'
 * and contacts' timelines — who, what, when, which lead — a page at a time, this organisation's only, in the brand the
 * request is scoped to (CrmActivityFeed).
 */
class ActivityFeedTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace, SetsUpCrmReports;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCrmReports();
    }

    public function test_a_crm_only_organisation_reads_who_did_what_on_which_lead_newest_first(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();
        $lead = $this->lead([], 'Peter Novak');
        $guest = (int) DB::table('inquiries')->where('id', $lead)->value('guest_id');
        DB::table('guests')->where('id', $guest)->update(['company' => 'Novak Dental']);
        $call = $this->activity(['inquiry_id' => $lead, 'guest_id' => $guest, 'brand_id' => $this->brandId, 'type' => 'call', 'subject' => 'Called about the plan',
            'body' => "<p>He wants to pay\n in two parts.</p>", 'duration_minutes' => 12, 'created_by' => $this->staffMember->id, 'occurred_at' => now()->subMinutes(5)]);
        $older = $this->activity(['inquiry_id' => $lead, 'brand_id' => $this->brandId, 'type' => 'chat', 'metadata' => json_encode(['conversation_id' => 44]), 'occurred_at' => now()->subHours(2)]);
        $contact = DB::table('guests')->insertGetId(['organization_id' => $this->org->id, 'full_name' => 'Grace Hopper', 'email' => 'grace@example.test', 'created_at' => now(), 'updated_at' => now()]);
        $note = $this->activity(['guest_id' => $contact, 'brand_id' => $this->brandId, 'type' => 'note', 'subject' => 'Met at the fair', 'created_by' => $this->manager->id, 'occurred_at' => now()->subHour()]);

        $body = $this->asStaffMember()->getJson($this->crmApi('activity'))->assertOk()->json();

        $this->assertSame([$call, $note, $older], array_column($body['data'], 'id'));
        $first = $body['data'][0];
        $this->assertSame('call', $first['type']);
        $this->assertSame('Called about the plan', $first['subject']);
        $this->assertSame('He wants to pay in two parts.', $first['excerpt'], 'tags and spacing gone');
        $this->assertSame(12, $first['duration_minutes']);
        $this->assertSame(['id' => $this->staffMember->id, 'name' => $this->staffMember->name], $first['by']);
        $this->assertSame(['id' => $lead, 'name' => 'Peter Novak', 'company' => 'Novak Dental', 'status' => 'New'], $first['lead']);
        $this->assertSame($guest, $first['contact']['id']);
        $this->assertNull($body['data'][1]['lead'], 'a contact\'s own line has no lead');
        $this->assertSame(['id' => $contact, 'name' => 'Grace Hopper'], $body['data'][1]['contact']);
        $this->assertSame(44, $body['data'][2]['conversation_id']);
        $this->assertNull($body['data'][2]['by'], 'a system line was logged by nobody');
        $this->assertSame(['current_page' => 1, 'last_page' => 1, 'total' => 3], $body['meta']);
    }

    public function test_an_organisation_on_another_module_is_refused(): void
    {
        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();

        $this->asManager()->getJson($this->crmApi('activity'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_another_organisations_lines_never_show(): void
    {
        $mine = $this->activity(['inquiry_id' => $this->lead(), 'brand_id' => $this->brandId, 'type' => 'email']);
        $other = $this->otherOrganisation();
        $theirGuest = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Someone Else', 'created_at' => now(), 'updated_at' => now()]);
        $theirLead = DB::table('inquiries')->insertGetId(['organization_id' => $other->id, 'guest_id' => $theirGuest, 'status' => 'New', 'next_task_completed' => false, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('activities')->insert(['organization_id' => $other->id, 'inquiry_id' => $theirLead, 'guest_id' => $theirGuest, 'type' => 'note', 'occurred_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        // A line of this organisation that names another's contact shows without it.
        $odd = $this->activity(['guest_id' => $theirGuest, 'type' => 'note', 'occurred_at' => now()->subDay()]);

        $body = $this->asStaffMember()->getJson($this->crmApi('activity'))->assertOk()->json();

        $this->assertSame([$mine, $odd], array_column($body['data'], 'id'));
        $this->assertNull($body['data'][1]['contact']);
    }

    public function test_a_chosen_brand_shows_its_leads_lines_and_its_own_lines_without_a_lead(): void
    {
        $second = DB::table('brands')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Old Town Studio', 'slug' => 'old-town', 'widget_token' => Str::random(40), 'is_default' => false, 'created_at' => now(), 'updated_at' => now()]);
        $ours = $this->activity(['inquiry_id' => $this->lead(['brand_id' => $second]), 'type' => 'call', 'occurred_at' => now()->subMinutes(1)]); // no brand stamped on the line
        $theirs = $this->activity(['inquiry_id' => $this->lead(), 'brand_id' => $this->brandId, 'type' => 'call', 'occurred_at' => now()->subMinutes(2)]);
        $loose = $this->activity(['type' => 'note', 'brand_id' => $second, 'occurred_at' => now()->subMinutes(3)]);
        $elsewhere = $this->activity(['type' => 'note', 'brand_id' => $this->brandId, 'occurred_at' => now()->subMinutes(4)]);

        $ids = fn (string $brand) => array_column($this->asStaffMember()->getJson($this->crmApi("activity?brand_id={$brand}"))->assertOk()->json('data'), 'id');

        $this->assertSame([$ours, $loose], $ids((string) $second));
        $this->assertSame([$theirs, $elsewhere], $ids((string) $this->brandId));
        $this->assertSame([$ours, $theirs, $loose, $elsewhere], $ids('all'));

        // A staff member held to one brand sees only it, whatever is asked.
        DB::table('brand_user')->insert(['brand_id' => $second, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame([$ours, $loose], $ids('all'));
    }

    public function test_a_page_at_a_time_and_one_type(): void
    {
        $lead = $this->lead();
        foreach (range(1, 5) as $i) {
            $this->activity(['inquiry_id' => $lead, 'type' => $i % 2 ? 'call' : 'email', 'subject' => "Line {$i}", 'occurred_at' => now()->subMinutes($i)]);
        }

        $page = $this->asStaffMember()->getJson($this->crmApi('activity?per_page=2&page=2'))->assertOk()->json();
        $this->assertSame(['Line 3', 'Line 4'], array_column($page['data'], 'subject'));
        $this->assertSame(['current_page' => 2, 'last_page' => 3, 'total' => 5], $page['meta']);

        $calls = $this->asStaffMember()->getJson($this->crmApi('activity?type=call'))->assertOk()->json('data');
        $this->assertSame(['Line 1', 'Line 3', 'Line 5'], array_column($calls, 'subject'));

        $this->asStaffMember()->getJson($this->crmApi('activity?type=drop_table'))->assertStatus(422);
        $this->asStaffMember()->getJson($this->crmApi('activity?per_page=500'))->assertStatus(422);
    }

    public function test_reading_writes_nothing(): void
    {
        $this->activity(['inquiry_id' => $this->lead(), 'type' => 'call']);
        $before = DB::table('activities')->count();

        $this->asStaffMember()->getJson($this->crmApi('activity'))->assertOk();

        $this->assertSame($before, DB::table('activities')->count());
    }
}
