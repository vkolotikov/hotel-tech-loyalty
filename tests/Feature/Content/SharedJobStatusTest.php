<?php

namespace Tests\Feature\Content;

use App\Services\Content\ContentRepeat;
use App\Services\Content\ContentVersions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * Production runs queued jobs on its Worker cluster, a container apart from the web app, and its default cache is the
 * container's own files (checked 2026-10-20). What a job tells the panel — versions still adapting, versions kept as
 * written and why, copies still being reworded — must live in the cache both share (`cache.shared`, the database).
 */
class SharedJobStatusTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        config(['cache.stores.shared_test' => ['driver' => 'array', 'serialize' => true], 'cache.shared' => 'shared_test']);
    }

    public function test_versions_still_adapting_and_kept_live_in_the_shared_cache(): void
    {
        ContentVersions::stillAdapting(7, [3, 4]);
        ContentVersions::keep(7, [3], 'budget');

        $this->assertSame([3, 4], Cache::store('shared_test')->get(ContentVersions::adaptingKey(7)));
        $this->assertSame(['3' => 'budget'], array_map('strval', (array) (Cache::store('shared_test')->get(ContentVersions::keptKey(7))['reasons'] ?? [])));
        $this->assertNull(Cache::get(ContentVersions::adaptingKey(7)));

        ContentVersions::stillAdapting(7, []);
        $this->assertNull(Cache::store('shared_test')->get(ContentVersions::adaptingKey(7)));
    }

    public function test_copies_being_reworded_live_in_the_shared_cache(): void
    {
        ContentRepeat::markRewriting(9, true);
        $this->assertTrue((bool) Cache::store('shared_test')->get(ContentRepeat::rewritingKey(9)));
        $this->assertNull(Cache::get(ContentRepeat::rewritingKey(9)));
        $this->assertTrue(ContentRepeat::isRewriting(9));

        ContentRepeat::markRewriting(9, false);
        $this->assertFalse(ContentRepeat::isRewriting(9));
    }

    // Queue review: a second batch of AI versions keeps the first batch's "Adapting…" — the list is read from the shared cache.
    public function test_a_second_ai_batch_keeps_the_first_batchs_adapting_versions(): void
    {
        $this->fakeAi([]); // nothing reaches the network
        Queue::fake();
        $post = $this->makePost(['platform' => 'instagram']);
        Cache::store('shared_test')->put(ContentVersions::adaptingKey((int) $post->id), [999], 600);
        $answer = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])->assertCreated();
        $made = (int) $answer->json('versions.0.id');
        $this->assertEqualsCanonicalizing([999, $made], Cache::store('shared_test')->get(ContentVersions::adaptingKey((int) $post->id)));
    }
}
