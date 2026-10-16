<?php

namespace Tests\Unit\Content;

use App\Models\ContentPlannerProfile;
use App\Services\Content\ContentBrandEditor;
use App\Services\Content\ContentRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * Quick setup checks "already set up" again once it holds its lock: a run that finished while this request waited
 * must not be paid for twice (spec 2026-10-15 §3.2). The check reads what is stored, not the instance in memory.
 */
class RefuseIfSetUpTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_profile_set_up_meanwhile_is_refused_even_when_the_instance_in_hand_is_older(): void
    {
        $stale = ContentPlannerProfile::findOrFail($this->profile->id);
        $stale->setup_completed_at = null; // what this request read before the other run finished
        ContentPlannerProfile::whereKey($this->profile->id)->update(['setup_completed_at' => now()]);

        try {
            app(ContentBrandEditor::class)->refuseIfSetUp($stale);
            $this->fail('expected already_set_up');
        } catch (ContentRefused $e) {
            $this->assertSame('already_set_up', $e->errorCode);
        }
    }

    public function test_a_profile_not_yet_set_up_passes(): void
    {
        ContentPlannerProfile::whereKey($this->profile->id)->update(['setup_completed_at' => null]);

        app(ContentBrandEditor::class)->refuseIfSetUp($this->profile->fresh());
        $this->addToAssertionCount(1);
    }
}
