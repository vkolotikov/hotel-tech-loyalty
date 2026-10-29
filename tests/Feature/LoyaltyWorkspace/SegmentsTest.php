<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\LoyaltyTier;
use App\Models\MemberSegment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\Concerns\ComparesJsonColumns;
use Tests\TestCase;

/** Segments (spec 2026-10-21 release 2 §6): rules that never match everyone by accident, tenant scope, roles. */
class SegmentsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, ComparesJsonColumns;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
    }

    public function test_the_options_come_from_the_server_with_this_organisations_tiers_only(): void
    {
        $this->otherOrganization();

        $response = $this->asStaffMember()->getJson($this->api('segments/options'))->assertOk()
            ->assertJsonPath('operators', ['AND', 'OR'])
            ->assertJsonPath('max_rules', 20)
            ->assertJsonPath('types.0', ['type' => 'tier', 'ops' => ['in', 'not_in'], 'value' => 'tiers', 'max' => 50])
            ->assertJsonPath('types.1', ['type' => 'activity', 'ops' => ['active_within', 'inactive_over'], 'value' => 'days', 'min' => 1, 'max' => 3650])
            ->assertJsonPath('types.4', ['type' => 'joined', 'ops' => ['after', 'before'], 'value' => 'date', 'min' => '1990-01-01', 'max' => '2100-12-31'])
            ->assertJsonPath('types.6', ['type' => 'earn', 'ops' => ['any', 'none'], 'value' => 'none']);

        $this->assertSame(['Silver', 'Gold', 'Platinum'], array_column($response->json('tiers'), 'name'));
    }

    public function test_a_manager_saves_rules_in_the_shared_format_and_the_count_is_recomputed(): void
    {
        $response = $this->asManager()->postJson($this->api('segments?brand_id=all'), [
            'name'     => '  Gold, quiet  ',
            'operator' => 'AND',
            'filters'  => [
                ['type' => 'tier', 'op' => 'in', 'value' => [$this->tiers['gold']->id, (string) $this->tiers['gold']->id]],
                ['type' => 'activity', 'op' => 'inactive_over', 'value' => '30'],
                ['type' => 'earn', 'op' => 'none', 'value' => ''],
            ],
        ])->assertCreated()
            ->assertJsonPath('segment.name', 'Gold, quiet')
            ->assertJsonPath('segment.everyone', false)
            ->assertJsonPath('segment.members', 1)
            ->assertJsonPath('segment.problem', null);

        $segment = MemberSegment::query()->findOrFail($response->json('segment.id'));
        $this->assertSameJson(['operator' => 'AND', 'filters' => [
            ['type' => 'tier', 'op' => 'in', 'value' => [$this->tiers['gold']->id]],
            ['type' => 'activity', 'op' => 'inactive_over', 'value' => 30],
            ['type' => 'earn', 'op' => 'none'],
        ]], $segment->definition);
        $this->assertSame(1, $segment->member_count_cached);
        $this->assertTrue(AuditLog::query()->where('action', 'segment_created')->where('subject_id', $segment->id)->exists());
    }

    public function test_everyone_is_a_choice_of_its_own_and_no_rules_without_it_is_refused(): void
    {
        $this->asManager()->postJson($this->api('segments'), ['name' => 'All', 'everyone' => true, 'filters' => []])
            ->assertCreated()->assertJsonPath('segment.everyone', true)->assertJsonPath('segment.members', 2);

        $this->asManager()->postJson($this->api('segments'), ['name' => 'Nothing', 'operator' => 'OR', 'filters' => []])
            ->assertStatus(422)->assertJsonPath('error', 'bad_rule')->assertJsonPath('index', null)->assertJsonPath('reason', 'no_rules');
        $this->asManager()->postJson($this->api('segments'), ['name' => 'Nothing', 'operator' => 'AND'])
            ->assertStatus(422)->assertJsonPath('reason', 'no_rules');
        $this->asManager()->postJson($this->api('segments'), ['name' => 'Both', 'everyone' => true, 'operator' => 'AND', 'filters' => [['type' => 'earn', 'op' => 'any']]])
            ->assertStatus(422)->assertJsonPath('reason', 'everyone_with_rules');

        $this->assertSame(['All'], MemberSegment::query()->pluck('name')->all());
    }

    /** Each of these the shared service would skip or widen, and a skipped rule matches everyone. */
    public function test_a_rule_the_shared_service_would_skip_is_refused_with_its_index_and_reason(): void
    {
        $theirs = $this->otherOrganization()['tier'];
        $ok = ['type' => 'earn', 'op' => 'any'];
        $cases = [
            'unknown_type'   => ['type' => 'birthday', 'op' => 'in', 'value' => 3],
            'unknown_op'     => ['type' => 'activity', 'op' => 'inactive_days', 'value' => 60],
            'no_value'       => ['type' => 'current_points', 'op' => 'min', 'value' => ''],
            'bad_value'      => ['type' => 'tier', 'op' => 'in', 'value' => ['gold']],
            'unknown_tier'   => ['type' => 'tier', 'op' => 'not_in', 'value' => [$theirs->id]],
            'out_of_range'   => ['type' => 'activity', 'op' => 'active_within', 'value' => 0],
        ];
        foreach ($cases as $reason => $rule) {
            $this->asManager()->postJson($this->api('segments'), ['name' => 'Bad', 'operator' => 'OR', 'filters' => [$ok, $rule]])
                ->assertStatus(422)->assertJsonPath('error', 'bad_rule')->assertJsonPath('index', 1)->assertJsonPath('reason', $reason);
        }
        foreach ([
            ['type' => 'joined', 'op' => 'after', 'value' => '2026-02-30'],
            ['type' => 'lifetime_points', 'op' => 'max', 'value' => 12.5],
            ['type' => 'redemptions', 'op' => 'any', 'value' => true],
        ] as $rule) {
            $this->asManager()->postJson($this->api('segments'), ['name' => 'Bad', 'operator' => 'AND', 'filters' => [$rule]])
                ->assertStatus(422)->assertJsonPath('index', 0)->assertJsonPath('reason', 'bad_value');
        }
        $this->asManager()->postJson($this->api('segments'), ['name' => 'Bad', 'operator' => 'AND', 'filters' => [['type' => 'current_points', 'op' => 'min', 'value' => 10_000_001]]])
            ->assertStatus(422)->assertJsonPath('reason', 'out_of_range');
        $this->asManager()->postJson($this->api('segments'), ['name' => 'Bad', 'operator' => 'AND', 'filters' => [['type' => 'joined', 'op' => 'before', 'value' => '1980-01-01']]])
            ->assertStatus(422)->assertJsonPath('reason', 'out_of_range');
        $this->asManager()->postJson($this->api('segments'), ['name' => 'Bad', 'operator' => 'XOR', 'filters' => [$ok]])
            ->assertStatus(422)->assertJsonPath('reason', 'operator');
        $this->asManager()->postJson($this->api('segments'), ['name' => 'Bad', 'operator' => 'AND', 'filters' => array_fill(0, 21, $ok)])
            ->assertStatus(422)->assertJsonPath('reason', 'too_many');

        $this->assertSame(0, MemberSegment::query()->count());
    }

    public function test_the_form_keeps_the_full_admins_name_rules(): void
    {
        $this->asManager()->postJson($this->api('segments'), ['name' => '', 'description' => str_repeat('x', 501), 'everyone' => true])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'description']);
    }

    public function test_the_preview_counts_unsaved_rules_and_shows_ten_members(): void
    {
        foreach (range(1, 11) as $i) {
            $this->makeMember("Guest {$i}", "guest{$i}@example.test", ['current_points' => 600 + $i, 'marketing_consent' => $i <= 3]);
        }

        $response = $this->asManager()->postJson($this->api('segments/preview'), [
            'operator' => 'OR',
            'filters'  => [['type' => 'current_points', 'op' => 'min', 'value' => 600], ['type' => 'tier', 'op' => 'in', 'value' => [$this->tiers['platinum']->id]]],
        ])->assertOk()->assertJsonPath('count', 12)->assertJsonPath('marketing', 3);

        $this->assertCount(10, $response->json('sample'));
        $this->assertSame('Guest 11', $response->json('sample.0.name'));
        $this->assertSame(['id', 'name', 'email', 'phone', 'member_number', 'tier_id', 'points', 'lifetime_points', 'is_active', 'joined_at', 'last_activity_at', 'credit_balance', 'valid_until', 'membership_state'], array_keys($response->json('sample.0')));

        $this->asManager()->postJson($this->api('segments/preview'), ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => []]]])
            ->assertStatus(422)->assertJsonPath('error', 'bad_rule')->assertJsonPath('reason', 'no_value');
    }

    public function test_staff_read_the_list_and_only_a_manager_changes_or_previews(): void
    {
        $segment = $this->makeSegment('All', ['operator' => 'AND', 'filters' => []]);

        $this->asStaffMember()->getJson($this->api('segments'))->assertOk()->assertJsonPath('segments.0.name', 'All');
        $this->asStaffMember()->postJson($this->api('segments'), ['name' => 'X', 'everyone' => true])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->putJson($this->api("segments/{$segment->id}"), ['name' => 'X', 'everyone' => true])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->deleteJson($this->api("segments/{$segment->id}"))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->postJson($this->api('segments/preview'), ['everyone' => true])->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->assertSame('All', $segment->fresh()->name);
    }

    public function test_the_list_marks_a_stored_rule_the_workspace_would_refuse(): void
    {
        // The full admin's model docblock shows `inactive_days`, which the shared service skips: this matches everyone.
        $this->makeSegment('Lapsed', ['operator' => 'AND', 'filters' => [['type' => 'activity', 'op' => 'inactive_days', 'value' => 60]]]);
        $this->makeSegment('Gold', ['operator' => 'and', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [(string) $this->tiers['gold']->id]]]]);

        $this->asStaffMember()->getJson($this->api('segments'))->assertOk()
            ->assertJsonPath('segments.0.name', 'Gold')
            ->assertJsonPath('segments.0.problem', null)
            ->assertJsonPath('segments.0.operator', 'AND')
            ->assertJsonPath('segments.0.members', 1)
            ->assertJsonPath('segments.1.name', 'Lapsed')
            ->assertJsonPath('segments.1.problem', ['index' => 0, 'reason' => 'unknown_op'])
            ->assertJsonPath('segments.1.members', 2);
    }

    public function test_a_manager_changes_a_segment_and_another_organisations_is_not_found(): void
    {
        $segment = $this->makeSegment('Gold', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [$this->tiers['gold']->id]]]]);

        $this->asManager()->putJson($this->api("segments/{$segment->id}"), [
            'name' => 'Big spenders', 'description' => 'Over 1,000', 'operator' => 'AND',
            'filters' => [['type' => 'lifetime_points', 'op' => 'min', 'value' => 1000]],
        ])->assertOk()->assertJsonPath('segment.name', 'Big spenders')->assertJsonPath('segment.description', 'Over 1,000')->assertJsonPath('segment.members', 1);
        $this->assertTrue(AuditLog::query()->where('action', 'segment_updated')->where('subject_id', $segment->id)->exists());

        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = MemberSegment::create(['name' => 'Theirs', 'definition' => ['operator' => 'AND', 'filters' => []]]);
        app()->instance('current_organization_id', $prior);

        $this->asManager()->putJson($this->api("segments/{$theirs->id}"), ['name' => 'Mine', 'everyone' => true])->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("segments/{$theirs->id}"))->assertStatus(404);
        $this->assertSame('Theirs', MemberSegment::withoutGlobalScopes()->find($theirs->id)->name);
        $this->assertNotContains('Theirs', array_column($this->asStaffMember()->getJson($this->api('segments'))->json('segments'), 'name'));
    }

    public function test_a_segment_a_draft_or_a_sending_campaign_uses_is_not_deleted(): void
    {
        $segment = $this->makeSegment('Gold', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [$this->tiers['gold']->id]]]]);
        $draft = EmailCampaign::create(['name' => 'Autumn', 'subject' => 'Hi', 'body_html' => '', 'segment_id' => $segment->id, 'status' => 'draft']);
        EmailCampaign::create(['name' => 'Summer', 'subject' => 'Hi', 'body_html' => '<p>x</p>', 'segment_id' => $segment->id, 'status' => 'sent']);

        $this->asManager()->deleteJson($this->api("segments/{$segment->id}"))
            ->assertStatus(409)->assertJsonPath('error', 'in_use')
            ->assertJsonPath('campaigns', [['id' => $draft->id, 'name' => 'Autumn', 'status' => 'draft']]);

        $draft->update(['status' => 'cancelled']);
        $this->asManager()->deleteJson($this->api("segments/{$segment->id}"))->assertOk();
        $this->assertNull(MemberSegment::query()->find($segment->id));
        $this->assertTrue(AuditLog::query()->where('action', 'segment_deleted')->exists());
    }

    public function test_segments_need_no_campaigns_feature(): void
    {
        $this->campaignsOn(false);

        $this->asManager()->getJson($this->api('segments'))->assertOk();
        $this->asManager()->postJson($this->api('segments'), ['name' => 'All', 'everyone' => true])->assertCreated();
    }

    public function test_an_inactive_member_is_never_counted(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['is_active' => false]);
        LoyaltyTier::query()->update(['is_active' => true]);

        $this->asManager()->postJson($this->api('segments/preview'), ['everyone' => true])->assertOk()->assertJsonPath('count', 1);
    }
}
