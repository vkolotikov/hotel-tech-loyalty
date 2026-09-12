<?php

namespace Tests\Feature\Voice;

use App\Models\User;
use App\Voice\VoiceCapability;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class VoiceCapabilityTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        config(['voice.enabled' => true, 'voice.organization_ids' => [1],
            'voice.medical_organization_ids' => []]);
        DB::table('organizations')->insert(['id' => 1, 'name' => 'Salon']);

        $this->staff = new User;
        $this->staff->id = 1;
        $this->staff->organization_id = 1;
    }

    private function capability(): VoiceCapability
    {
        return new VoiceCapability;
    }

    public function test_allows_an_allowlisted_non_medical_organization(): void
    {
        $this->capability()->assertEnabled($this->staff);
        $this->capability()->assertWritable($this->staff);
        $this->assertFalse($this->capability()->isReadOnly($this->staff));
    }

    public function test_refuses_when_voice_is_disabled_or_unlisted(): void
    {
        config(['voice.enabled' => false]);
        $this->assertRefused(fn () => $this->capability()->assertEnabled($this->staff));

        config(['voice.enabled' => true, 'voice.organization_ids' => []]);
        $this->assertRefused(fn () => $this->capability()->assertEnabled($this->staff));

        config(['voice.organization_ids' => [2]]);
        $this->assertRefused(fn () => $this->capability()->assertEnabled($this->staff));
    }

    public function test_medical_organizations_are_denied_until_they_opt_in_then_stay_read_only(): void
    {
        DB::table('organizations')->where('id', 1)->update(['industry' => 'medical']);
        $this->assertRefused(fn () => $this->capability()->assertEnabled($this->staff));

        config(['voice.medical_organization_ids' => [1]]);
        $this->capability()->assertEnabled($this->staff);
        $this->assertTrue($this->capability()->isReadOnly($this->staff));
        $this->assertRefused(fn () => $this->capability()->assertWritable($this->staff));
    }

    private function assertRefused(callable $call): void
    {
        try {
            $call();
            $this->fail('Expected an AuthorizationException.');
        } catch (AuthorizationException $error) {
            $this->assertNotSame('', $error->getMessage());
        }
    }
}
