<?php

namespace Tests\Feature\VoiceAlexa;

use App\Models\User;
use App\Models\VoiceAlexaLink;
use App\Voice\Alexa\AlexaPairing;
use App\Voice\Alexa\AlexaPairingLockedException;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Voice\VoiceTestCase;

class AlexaPairingTest extends VoiceTestCase
{
    private const ECHO_ACCOUNT = 'amzn1.ask.account.kitchen-echo';

    private function pairing(): AlexaPairing
    {
        return app(AlexaPairing::class);
    }

    public function test_a_claimed_code_links_the_echo_read_only_to_the_staff_member_who_issued_it(): void
    {
        $code = $this->pairing()->issue($this->staff);
        $this->assertMatchesRegularExpression('/\A\d{6}\z/', $code);

        $link = $this->pairing()->claim(self::ECHO_ACCOUNT, $code);

        $this->assertInstanceOf(VoiceAlexaLink::class, $link);
        $this->assertSame((int) $this->staff->id, (int) $link->user_id);
        $this->assertSame(1, (int) $link->organization_id);
        $this->assertFalse($link->can_write, 'A new Echo link is read-only.');
        $this->assertNull($link->revoked_at);
    }

    public function test_a_code_works_once(): void
    {
        $code = $this->pairing()->issue($this->staff);

        $this->assertNotNull($this->pairing()->claim(self::ECHO_ACCOUNT, $code));
        $this->assertNull($this->pairing()->claim('amzn1.ask.account.second-echo', $code));
    }

    public function test_an_expired_code_fails(): void
    {
        $code = $this->pairing()->issue($this->staff);

        $this->travel(601)->seconds();

        $this->assertNull($this->pairing()->claim(self::ECHO_ACCOUNT, $code));
    }

    public function test_spoken_digits_with_spaces_are_normalized(): void
    {
        $code = $this->pairing()->issue($this->staff);
        $spoken = substr($code, 0, 2).' '.substr($code, 2, 2).' '.substr($code, 4);

        $this->assertNotNull($this->pairing()->claim(self::ECHO_ACCOUNT, $spoken));
    }

    public function test_guessing_is_locked_after_five_wrong_attempts_even_with_a_right_code(): void
    {
        $code = $this->pairing()->issue($this->staff);
        $wrong = $code === '000000' ? '111111' : '000000';

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->assertNull($this->pairing()->claim(self::ECHO_ACCOUNT, $wrong));
        }

        $this->expectException(AlexaPairingLockedException::class);
        $this->pairing()->claim(self::ECHO_ACCOUNT, $code);
    }

    public function test_re_pairing_an_echo_moves_it_to_the_new_staff_member_and_resets_notes(): void
    {
        DB::table('users')->insert(['id' => 2, 'organization_id' => 1,
            'email' => 'second@example.test', 'name' => 'Second', 'user_type' => 'staff']);
        DB::table('staff')->insert(['user_id' => 2, 'organization_id' => 1]);

        $first = $this->pairing()->claim(self::ECHO_ACCOUNT, $this->pairing()->issue($this->staff));
        $first->forceFill(['can_write' => true])->save();

        $second = $this->pairing()->claim(self::ECHO_ACCOUNT, $this->pairing()->issue(User::findOrFail(2)));

        $this->assertSame($first->id, $second->id, 'One link per Amazon account.');
        $this->assertSame(2, (int) $second->user_id);
        $this->assertFalse($second->fresh()->can_write, 'Permission to add notes never carries over to a new person.');
        $this->assertSame(1, VoiceAlexaLink::query()->count());
    }

    public function test_the_amazon_account_id_is_stored_only_as_a_hash(): void
    {
        $this->pairing()->claim(self::ECHO_ACCOUNT, $this->pairing()->issue($this->staff));

        $this->assertSame(hash('sha256', self::ECHO_ACCOUNT), VoiceAlexaLink::query()->value('alexa_user_hash'));
        $this->assertStringNotContainsString('kitchen-echo', json_encode(DB::table('voice_alexa_links')->get()));
    }
}
