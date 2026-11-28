<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Services\CrmAiToolset;
use App\Services\CrmVoiceToolset;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The CRM assistant's tools ask the person's own rights (security review, 2026-11-04). Its routes let every staff
 * member of a CRM organisation in, so before then anyone could have it give or take up to 100,000 points (1,000,000
 * by voice) without "can award points", read every secret setting (Stripe, Twilio, mail) and change any setting.
 */
class CrmAiRightsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpBookingRefundSchema();
        foreach ([['stripe_secret_key', 'sk_test_not_a_real_key_0000', 'payments'], ['points_per_currency', '2', 'loyalty']] as [$key, $value, $group]) {
            DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => $key, 'value' => $value, 'type' => 'string',
                'group' => $group, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /** This organisation's row (PostgreSQL's built database holds other organisations' rows for the same keys). */
    private function setting(string $key): ?string
    {
        return DB::table('hotel_settings')->where('organization_id', $this->org->id)->where('key', $key)->value('value');
    }

    private function receptionist(): \App\Models\User
    {
        return $this->staffUser($this->org, ['role' => 'staff', 'can_award_points' => false, 'can_redeem_points' => false]);
    }

    public function test_points_by_chat_need_the_persons_own_rights(): void
    {
        $nobody = new CrmAiToolset($this->receptionist());
        $this->assertFalse($nobody->executeTool('award_points', ['member_id' => $this->grace->id, 'points' => 50000, 'description' => 'Bonus'])['success']);
        $this->assertFalse($nobody->executeTool('redeem_points', ['member_id' => $this->ada->id, 'points' => 100, 'description' => 'Take'])['success']);
        $this->assertFalse((new CrmAiToolset())->executeTool('award_points', ['member_id' => $this->grace->id, 'points' => 5, 'description' => 'Bonus'])['success']);
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
        $this->assertSame(1500, (int) $this->ada->fresh()->current_points);

        $desk = new CrmAiToolset($this->staffMember);
        $this->assertTrue($desk->executeTool('award_points', ['member_id' => $this->grace->id, 'points' => 50, 'description' => 'Bonus'])['success']);
        $this->assertSame(250, (int) $this->grace->fresh()->current_points);
    }

    public function test_points_by_voice_need_the_persons_own_rights(): void
    {
        $voice = app(CrmVoiceToolset::class);
        $refused = $voice->execute('award_points', ['member_id' => $this->grace->id, 'points' => 900000, 'description' => 'Bonus'], $this->org->id, $this->receptionist()->id);
        $this->assertArrayHasKey('error', $refused);
        $this->assertArrayHasKey('error', $voice->execute('redeem_points', ['member_id' => $this->ada->id, 'points' => 100, 'description' => 'Take'], $this->org->id, $this->receptionist()->id));
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
        $this->assertSame(1500, (int) $this->ada->fresh()->current_points);

        $this->assertTrue($voice->execute('award_points', ['member_id' => $this->grace->id, 'points' => 50, 'description' => 'Bonus'], $this->org->id, $this->staffMember->id)['ok'] ?? false);
        $this->assertSame(250, (int) $this->grace->fresh()->current_points);
    }

    public function test_settings_by_chat_never_answer_a_secret_and_change_only_for_a_manager(): void
    {
        $answer = json_encode((new CrmAiToolset($this->manager))->executeTool('get_settings', [])['data']);
        $this->assertStringNotContainsString('sk_test_not_a_real_key_0000', $answer);
        $this->assertStringContainsString('(set)', $answer);

        $this->assertFalse((new CrmAiToolset($this->receptionist()))->executeTool('update_setting', ['key' => 'points_per_currency', 'value' => '50'])['success']);
        $this->assertFalse((new CrmAiToolset($this->manager))->executeTool('update_setting', ['key' => 'stripe_secret_key', 'value' => 'sk_test_other_0000'])['success']);
        $this->assertSame('2', $this->setting('points_per_currency'));
        $this->assertSame('sk_test_not_a_real_key_0000', $this->setting('stripe_secret_key'));

        $this->assertTrue((new CrmAiToolset($this->manager))->executeTool('update_setting', ['key' => 'points_per_currency', 'value' => '3'])['success']);
    }

    public function test_chat_settings_use_programme_validation_and_cannot_restore_a_deleted_reward_reference(): void
    {
        $options = \App\Services\Loyalty\Programme\ProgrammeOptions::class;
        $reward = \App\Models\Reward::create(['name' => 'Unused gift', 'points_cost' => 50]);
        $options::save($this->org->id, ['stamp_reward_id' => $reward->id], $this->manager);
        $options::save($this->org->id, ['stamp_reward_id' => null], $this->manager);
        app(\App\Services\Loyalty\RewardManagement::class)->delete($reward, $this->manager);
        $options::rememberTemplate($this->org->id, 'restaurant');
        $tool = new CrmAiToolset($this->manager);

        $this->assertFalse($tool->executeTool('update_setting', ['key' => 'stamp_reward_id', 'value' => $reward->id])['success']);
        $this->assertNull($options::get($this->org->id, 'stamp_reward_id'));
        $this->assertFalse($tool->executeTool('update_setting', ['key' => 'programme_setup_template', 'value' => 'beauty'])['success']);
        $this->assertSame('restaurant', $options::get($this->org->id, 'programme_setup_template'));
        $this->assertFalse($tool->executeTool('update_setting', ['key' => 'points_per_currency', 'value' => '-5'])['success']);
        $this->assertSame('2', $this->setting('points_per_currency'));
    }
}
