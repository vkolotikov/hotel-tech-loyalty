<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentLinks;
use App\Services\ContentPlanner\ContextBuilder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class CampaignExportsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_selected_campaign_reaches_real_generation_prompt_and_new_posts_and_copies(): void
    {
        $c = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'name' => 'Winter target', 'goal' => 'Repeat guests', 'notes' => 'Unique winter campaign brief']);
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11', 'campaign_id' => $c->id])->assertOk()->assertJsonPath('created_count', 1);
        Http::assertSent(fn ($r) => str_contains($r->body(), 'Unique winter campaign brief') && str_contains($r->body(), 'Repeat guests'));
        $post = ContentPlannerPost::where('campaign_id', $c->id)->firstOrFail();
        $this->asStaffMember()->postJson($this->api("posts/$post->id/duplicate"))->assertCreated()->assertJsonPath('post.campaign_id', $c->id);
        $this->asStaffMember()->postJson($this->api("posts/$post->id/versions"), ['platforms' => ['linkedin'], 'ai' => false])->assertSuccessful();
        $this->assertSame(3, ContentPlannerPost::where('campaign_id', $c->id)->count());
    }

    public function test_assignment_retags_only_the_changed_post_keeps_code_and_explicit_destination_tags(): void
    {
        $c = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'name' => 'Winter target']);
        $p = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'link' => 'https://example.test/?utm_campaign=custom'])->assertCreated()->json('post');
        $saved = $this->asStaffMember()->putJson($this->api("posts/{$p['id']}"), ['campaign_id' => $c->id, 'updated_at' => $p['updated_at']])->assertOk()->json('post');
        $this->assertSame($p['link']['code'], $saved['link']['code']);
        $link = ContentLinks::ofPost(ContentPlannerPost::find($p['id']));
        $this->assertSame('winter-target', $link->utm['utm_campaign']);
        $this->assertSame('https://example.test/?utm_campaign=custom', $link->destination);
        $this->asStaffMember()->putJson($this->api("posts/{$p['id']}"), ['campaign_id' => null, 'updated_at' => $saved['updated_at']])->assertOk();
        $this->assertSame('content-plan', $link->fresh()->utm['utm_campaign']);
    }

    public function test_cross_organization_and_restricted_brand_exports_never_leak(): void
    {
        $other = $this->otherOrganization();
        $mine = $this->makePost(['topic' => 'Only mine']);
        $fallback = $this->asStaffMember()->get($this->api('exports/csv?brand_id='.$other['brandId']))->assertOk()->streamedContent();
        $this->assertStringContainsString('Only mine', $fallback);
        $this->assertStringNotContainsString($other['post']->topic, $fallback);
        $bytes = $this->asStaffMember()->get($this->api('exports/csv'))->assertOk()->streamedContent();
        $this->assertStringContainsString('Only mine', $bytes);
        $this->assertStringNotContainsString($other['post']->topic, $bytes);
        [$second] = $this->secondBrand();
        $this->staffMember->brands()->attach($this->brandId);
        $this->asStaffMember()->getJson($this->api('exports/ics?brand_id='.$second))->assertForbidden();
        $this->asStaffMember()->getJson($this->api('campaigns?brand_id='.$second))->assertForbidden();
        $this->assertNotNull($mine->fresh());
    }

    public function test_managers_manage_staff_assign_and_archive_preserves_history(): void
    {
        $body = ['name' => 'Autumn offer', 'goal' => 'Bookings', 'brief' => 'Local seasonal detail', 'start_date' => '2026-10-01', 'end_date' => '2026-10-31', 'status' => 'active'];
        $this->asStaffMember()->postJson($this->api('campaigns'), $body)->assertForbidden();
        $id = $this->asManager()->postJson($this->api('campaigns'), $body)->assertCreated()->assertJsonPath('campaign.brief', $body['brief'])->json('campaign.id');
        $this->asStaffMember()->getJson($this->api('campaigns'))->assertOk()->assertJsonCount(1, 'campaigns');
        $p = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'campaign_id' => $id, 'link' => 'https://example.test/offer'])->assertCreated()->json('post');
        $link = DB::table('content_links')->where('post_id', $p['id'])->first();
        $this->assertStringContainsString('Autumn offer', app(ContextBuilder::class)->campaign($this->profile, $id));
        $this->asManager()->putJson($this->api("campaigns/$id"), ['status' => 'archived'])->assertOk();
        $this->assertSame($id, (int) ContentPlannerPost::find($p['id'])->campaign_id);
        $this->assertEquals($link, DB::table('content_links')->where('post_id', $p['id'])->first());
        $this->asStaffMember()->getJson($this->api("posts?campaign_id=$id"))->assertJsonCount(1, 'data');
        $this->asStaffMember()->putJson($this->api("campaigns/$id"), ['name' => 'No'])->assertForbidden();
        $this->asManager()->putJson($this->api("campaigns/$id"), ['start_date' => '2027-01-01'])->assertUnprocessable();
    }

    public function test_foreign_campaigns_cannot_be_read_assigned_filtered_or_generated(): void
    {
        $foreign = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->secondBrand()[0], 'name' => 'Private']);
        $this->asManager()->putJson($this->api("campaigns/$foreign->id"), ['name' => 'Leak'])->assertNotFound();
        $this->asStaffMember()->getJson($this->api('campaigns'))->assertJsonCount(0, 'campaigns');
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'campaign_id' => $foreign->id])->assertUnprocessable();
        foreach (['posts', 'exports/csv', 'exports/ics'] as $route) {
            $this->asStaffMember()->getJson($this->api("$route?campaign_id=$foreign->id"))->assertUnprocessable();
        }
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-10', 'campaign_id' => $foreign->id])->assertUnprocessable();
        $this->assertSame('', app(ContextBuilder::class)->campaign($this->profile, $foreign->id));
    }

    public function test_csv_bytes_round_trip_multiline_unicode_and_formula_prefixes(): void
    {
        $inputs = ['=1+1', " \t＋SUM(1)", "\r\n@evil", '－1', '＠x', "A,\"B\"\nРига 🌿"];
        foreach ($inputs as $v) {
            $this->makePost(['topic' => $v, 'main_copy' => $v, 'scheduled_date' => null]);
        }
        $response = $this->asStaffMember()->get($this->api('exports/csv'))->assertOk();
        $bytes = $response->streamedContent();
        $this->assertSame("\xEF\xBB\xBF", substr($bytes, 0, 3));
        $stream = fopen('php://temp', 'r+');
        fwrite($stream, substr($bytes, 3));
        rewind($stream);
        $header = fgetcsv($stream, escape: '');
        $rows = [];
        while (($row = fgetcsv($stream, escape: '')) !== false) {
            $rows[] = array_combine($header, $row);
        }
        fclose($stream);
        $this->assertCount(6, $rows);
        foreach ($inputs as $i => $v) {
            $this->assertContains($i < 5 ? "\t".$v : $v, array_column($rows, 'topic'));
        }
        $this->assertSame([''], array_values(array_unique(array_column($rows, 'scheduled_date'))));
        $this->asStaffMember()->getJson($this->api('exports/ics'))->assertUnprocessable()->assertJsonPath('error', 'export_empty');
    }

    public function test_ics_timezone_date_only_unicode_folding_and_injection(): void
    {
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'hotel_timezone', 'value' => 'Europe/Riga', 'type' => 'string', 'group' => 'general']);
        $summer = $this->makePost(['scheduled_date' => '2026-07-01', 'scheduled_time' => '12:30', 'topic' => str_repeat('Рига🌿', 30), 'main_copy' => "hello\r\nBEGIN:VEVENT\nsemi;comma,back\\"]);
        $this->makePost(['scheduled_date' => '2026-01-01', 'scheduled_time' => '12:30']);
        $this->makePost(['scheduled_date' => '2026-03-29', 'scheduled_time' => '04:30']);
        $this->makePost(['scheduled_date' => '2026-10-25', 'scheduled_time' => '04:30']);
        $this->makePost(['scheduled_date' => '2026-03-29', 'scheduled_time' => '03:30']);
        $this->makePost(['scheduled_date' => '2026-10-25', 'scheduled_time' => '03:30']);
        $this->makePost(['scheduled_date' => '2026-07-02', 'scheduled_time' => null]);
        $this->makePost(['scheduled_date' => null]);
        $bytes = $this->asStaffMember()->get($this->api('exports/ics'))->assertOk()->streamedContent();
        $unfold = str_replace("\r\n ", '', $bytes);
        $this->assertSame(7, substr_count($unfold, "\r\nBEGIN:VEVENT\r\n"));
        foreach (['20260701T093000Z', '20260101T103000Z', '20260329T013000Z', '20261025T023000Z', '20261025T003000Z'] as $date) {
            $this->assertStringContainsString('DTSTART:'.$date, $unfold);
        }
        $this->assertStringContainsString('DTSTART;VALUE=DATE:20260702', $unfold);
        $this->assertStringContainsString('hello\\nBEGIN:VEVENT\\nsemi\\;comma\\,back\\\\', $unfold);
        $this->assertStringContainsString("UID:content-{$this->org->id}-{$this->brandId}-{$summer->id}@hexa-tech", $unfold);
        foreach (explode("\r\n", $bytes) as $line) {
            $this->assertLessThanOrEqual(75, strlen($line));
            $this->assertTrue(mb_check_encoding($line, 'UTF-8'));
        }
        $this->assertSame('12:30', substr($summer->fresh()->getRawOriginal('scheduled_time'), 0, 5));
    }

    public function test_empty_invalid_and_over_limit_exports_refuse_before_streaming(): void
    {
        $this->asStaffMember()->getJson($this->api('exports/csv'))->assertUnprocessable()->assertJsonPath('error', 'export_empty');
        $this->asStaffMember()->getJson($this->api('exports/csv?status=invalid'))->assertUnprocessable();
        $template = $this->makePost()->getAttributes();
        unset($template['id']);
        for ($i = 0; $i < 50; $i++) {
            DB::table('content_planner_posts')->insert(array_fill(0, 100, $template));
        }
        foreach (['csv', 'ics'] as $format) {
            $this->asStaffMember()->getJson($this->api("exports/$format"))->assertUnprocessable()->assertJsonPath('error', 'export_too_many');
        }
        ContentPlannerPost::orderByDesc('id')->first()->delete();
        $csv = $this->asStaffMember()->get($this->api('exports/csv?page=99'))->assertOk()->streamedContent();
        $this->assertSame(5001, substr_count($csv, "\r\n"));
        $this->asStaffMember()->getJson($this->api('exports/csv?q=absent'))->assertUnprocessable()->assertJsonPath('error', 'export_empty');
    }
}
