<?php

namespace Tests\Feature\Content;

use App\Jobs\AdaptPostVersions;
use App\Jobs\RewriteRepeatCopies;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerVisualBrief;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRepeat;
use App\Services\Content\ContentRepeatRewriter;
use App\Services\Content\ContentVersionAdapter;
use App\Services\Content\ContentVersions;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentVisualBriefService;
use GuzzleHttp\Psr7\Response;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class FinalReviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        Http::preventStrayRequests();
    }

    /** Old workers deserialize properties without running the current constructor. */
    private function legacy(object $job): object
    {
        $payload = $job->__serialize();
        unset($payload['userId']);
        $old = (new \ReflectionClass($job))->newInstanceWithoutConstructor();
        $old->__unserialize($payload);

        return unserialize(serialize($old));
    }

    public function test_legacy_versions_chain_remaining_items_and_clear_terminal_indicator(): void
    {
        $original = $this->makePost();
        $this->asStaffMember()->postJson($this->api("posts/{$original->id}/versions"), ['platforms' => ['linkedin', 'x']])->assertCreated();
        $ids = ContentPlannerPost::where('group_id', $original->id)->where('id', '!=', $original->id)->pluck('id')->all();
        $adapter = Mockery::mock(ContentVersionAdapter::class);
        $adapter->shouldReceive('adapt')->twice()->andReturn(['hook' => 'Adapted legacy version']);
        Queue::fake();
        ContentVersions::stillAdapting($original->id, $ids);
        $job = $this->legacy(new AdaptPostVersions($original->id, $this->org->id, $this->brandId, 'instagram', $ids));
        $job->handle($adapter, app(ContentAiGate::class));
        Queue::assertPushed(AdaptPostVersions::class, 1);
        $next = Queue::pushed(AdaptPostVersions::class)->first();
        $this->assertSame([$ids[1]], $next->versionIds);
        $this->assertNull($next->userId);
        $this->assertSame([$ids[1]], \Illuminate\Support\Facades\Cache::get(ContentVersions::adaptingKey($original->id)));
        $next->handle($adapter, app(ContentAiGate::class));
        $this->assertSame(['Adapted legacy version'], ContentPlannerPost::whereIn('id', $ids)->pluck('hook')->unique()->values()->all());
        $this->assertFalse(\Illuminate\Support\Facades\Cache::has(ContentVersions::adaptingKey($original->id)));
    }

    public function test_legacy_repeats_chain_after_a_changed_item_and_clear_terminal_indicator(): void
    {
        $original = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$original->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated();
        $copies = ContentPlannerPost::where('series_id', $original->id)->where('id', '!=', $original->id)->orderBy('id')->get();
        $copies[0]->update(['hook' => 'Keep human words']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->once()->andReturn(['hook' => 'Rewritten legacy copy']);
        Queue::fake();
        ContentRepeat::markRewriting($original->id, true);
        $job = $this->legacy(new RewriteRepeatCopies($original->id, $this->org->id, $this->brandId, $copies->modelKeys()));
        $job->handle($rewriter, app(ContentAiGate::class));
        Queue::assertPushed(RewriteRepeatCopies::class, 1);
        $next = Queue::pushed(RewriteRepeatCopies::class)->first();
        $this->assertSame([$copies[1]->id], $next->copyIds);
        $this->assertNull($next->userId);
        $this->getJson($this->api("posts/{$original->id}"))->assertJsonPath('post.series.rewriting', true);
        $next->handle($rewriter, app(ContentAiGate::class));
        $this->assertSame('Keep human words', $copies[0]->fresh()->hook);
        $this->assertSame('Rewritten legacy copy', $copies[1]->fresh()->hook);
        $this->getJson($this->api("posts/{$original->id}"))->assertJsonPath('post.series.rewriting', false);
    }

    public static function staleActions(): array
    {
        $cases = [];
        foreach (['mark-ready', 'mark-published'] as $action) {
            foreach (['words', 'visual', 'lock-race'] as $change) $cases["$action/$change"] = [$action, $change];
        }
        return $cases;
    }

    public function test_manual_transitions_require_the_seen_revision_and_accept_full_precision(): void
    {
        $this->profile->update(['requires_approval' => true]);
        foreach (['mark-ready' => 'ready_to_publish', 'mark-published' => 'published'] as $action => $status) {
            $post = $this->makePost(['status' => 'needs_review']);
            $this->asManager()->postJson($this->api("posts/{$post->id}/{$action}"))->assertUnprocessable()->assertJsonValidationErrors('updated_at');
            $this->assertSame('needs_review', $post->fresh()->status);
            $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
            $this->postJson($this->api("posts/{$post->id}/{$action}"), ['updated_at' => 'not-a-revision'])->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
            $this->postJson($this->api("posts/{$post->id}/{$action}"), ['updated_at' => $post->updated_at->toISOString()])->assertOk()->assertJsonPath('post.status', $status);
            $this->assertSame(['approved'], ContentPlannerPostEvent::where('post_id', $post->id)->pluck('kind')->all());
        }
    }

    #[DataProvider('staleActions')]
    public function test_manual_transition_refuses_unseen_revision_without_mutation(string $action, string $change): void
    {
        $this->profile->update(['requires_approval' => true]);
        $post = $this->makePost(['status' => 'needs_review', 'hook' => 'Seen words']);
        $seen = $post->updated_at->toISOString();
        $other = function () use ($post, $change) {
            if ($change === 'visual') ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Unseen visual']);
            DB::table('content_planner_posts')->where('id', $post->id)->update(['updated_at' => now()->addSecond(), 'hook' => $change === 'visual' ? 'Seen words' : 'Unseen words']);
        };
        if ($change === 'lock-race') {
            $done = false;
            DB::listen(function (QueryExecuted $query) use ($post, $other, &$done) {
                if (!$done && str_starts_with(strtolower(ltrim($query->sql)), 'select') && str_contains($query->sql, 'from "content_planner_posts"') && preg_match('/"id" = \?/', $query->sql) && (int) ($query->bindings[0] ?? 0) === $post->id) {
                    $done = true;
                    $other();
                }
            });
        } else $other();
        $this->asManager()->postJson($this->api("posts/{$post->id}/{$action}"), ['updated_at' => $seen, 'published_url' => 'https://example.test/post'])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere')->assertJsonPath('post.status', 'needs_review');
        $current = $post->fresh();
        $this->assertSame('needs_review', $current->status);
        $this->assertSame($change === 'visual' ? 'Seen words' : 'Unseen words', $current->hook);
        $this->assertNull($current->published_at);
        $this->assertNull($current->published_url);
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    public function test_sdk_optional_total_and_invalid_totals_reach_actual_ledger_once(): void
    {
        Storage::fake('public');
        config(['filesystems.media_disk' => 'public', 'openai.api_key' => 'test-only']);
        foreach (['omitted', 'valid', 'null', 'malformed', 'contradictory', 'incomplete'] as $kind) {
            $usage = ['input_tokens' => 1, 'output_tokens' => 1, 'input_tokens_details' => ['text_tokens' => 1, 'image_tokens' => 0]];
            if ($kind !== 'omitted') $usage['total_tokens'] = match ($kind) { 'valid' => 2, 'null' => null, 'malformed' => '2', default => 99 };
            if ($kind === 'incomplete') { unset($usage['total_tokens'], $usage['input_tokens_details']['text_tokens']); }
            $transport = new class($usage) implements ClientInterface {
                public int $calls = 0;
                public function __construct(private array $usage) {}
                public function sendRequest(RequestInterface $request): ResponseInterface
                {
                    $this->calls++;
                    return new Response(200, ['Content-Type' => 'application/json'], json_encode(['created' => 1, 'data' => [['b64_json' => base64_encode('local image fixture')]], 'usage' => $this->usage]));
                }
            };
            $post = $this->makePost();
            ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Garden']);
            $before = DB::table('ai_usage_logs')->count();
            $brief = (new ImageGenerationService(app(ContentVisualBriefService::class), null, $transport))->generateForPost($post);
            $row = DB::table('ai_usage_logs')->latest('id')->first();
            $this->assertSame('ready', $brief->image_status);
            $this->assertSame(1, $transport->calls);
            $this->assertSame($before + 1, DB::table('ai_usage_logs')->count());
            $exact = in_array($kind, ['omitted', 'valid'], true);
            $this->assertSame($exact ? 1 : 6, (int) $row->cost_cents, $kind);
            $this->assertSame($exact ? 1 : 1756, (int) $row->output_tokens, $kind);
        }
    }
}
