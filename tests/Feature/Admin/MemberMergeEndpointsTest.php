<?php

namespace Tests\Feature\Admin;

use App\Models\LoyaltyMember;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's duplicates and merge (MemberMergeController). Release 2 fixes the shared merge so it keeps all
 * history (R2-3, MemberMergeServiceTest proves each table); the endpoints answer as they did: the suggestions, the
 * merge's message and summary, a field error for the same member twice, not found for another organisation's.
 */
class MemberMergeEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/members/' . ltrim($path, '/');
    }

    public function test_suggestions_pair_a_shared_email_oldest_first(): void
    {
        $twin = $this->makeMember('Ada L.', 'twin@example.test');
        DB::table('users')->where('id', $twin->user_id)->update(['email' => strtoupper($this->ada->user->email)]);
        $twin->forceFill(['created_at' => now()->addMinute()])->save();

        $pairs = $this->asManager()->getJson($this->admin('duplicates'))->assertOk()->json('pairs');

        $this->assertCount(1, $pairs);
        $this->assertSame('shared_email', $pairs[0]['reason']);
        $this->assertSame($this->ada->id, $pairs[0]['winner']['id']);
        $this->assertSame($twin->id, $pairs[0]['loser']['id']);
    }

    public function test_merge_answers_with_its_message_and_summary(): void
    {
        $response = $this->asManager()->postJson($this->admin('merge'), ['winner_id' => $this->ada->id, 'loser_id' => $this->grace->id, 'reason' => 'Same person'])
            ->assertOk()
            ->assertJsonPath('message', 'Members merged successfully.')
            ->assertJsonPath('result.winner_id', $this->ada->id)
            ->assertJsonPath('result.loser_id', $this->grace->id);
        $this->assertIsArray($response->json('result.moved'));
        $this->assertNull(LoyaltyMember::query()->find($this->grace->id));
        $this->assertSame(1700, (int) $this->ada->fresh()->current_points);
    }

    public function test_merge_refuses_the_same_member_and_another_organisations(): void
    {
        $this->asManager()->postJson($this->admin('merge'), ['winner_id' => $this->ada->id, 'loser_id' => $this->ada->id])
            ->assertStatus(422)->assertJsonValidationErrors('loser_id');

        $other = $this->otherOrganization()['member'];
        $this->asManager()->postJson($this->admin('merge'), ['winner_id' => $this->ada->id, 'loser_id' => $other->id])->assertNotFound();
        $this->assertNotNull(LoyaltyMember::withoutGlobalScopes()->find($other->id));
    }
}
