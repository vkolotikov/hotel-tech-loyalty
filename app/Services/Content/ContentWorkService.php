<?php

namespace App\Services\Content;

use App\Jobs\RunContentWork;
use App\Models\ContentPlannerPost;
use App\Models\ContentWork;
use App\Models\Organization;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPlanner\CalendarGenerationBudget;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentPostGenerationService;
use App\Services\ContentQualityService;
use App\Services\ContentVisualBriefService;
use Illuminate\Support\Facades\DB;

final class ContentWorkService
{
    public const ACTIONS = ['write', 'rewrite', 'quality', 'brief', 'image', 'fill'];

    public const RUN_SECONDS = 120;

    public function create(array $input, User $user): ContentWork
    {
        $profile = ContentContext::requireProfile();
        $orgId = (int) $profile->organization_id;
        $brandId = (int) $profile->brand_id;
        $created = false;
        $row = DB::transaction(function () use ($input, $user, $orgId, $brandId, $profile, &$created) {
            // Serialize submission only, never a provider call. Also protects one active work per post.
            Organization::whereKey($orgId)->lockForUpdate()->firstOrFail();
            $existing = ContentWork::where('requester_id', $user->id)->where('request_key', $input['request_key'])->first();
            if ($existing) {
                if ($existing->input !== $input) {
                    throw new ContentRefused('request_key_used', 'This request key already belongs to different work.', 409);
                }

                return $existing;
            }
            app(ContentAiGate::class)->allow(Organization::findOrFail($orgId));
            $post = null;
            if ($input['action'] !== 'fill') {
                $post = ContentPlannerPost::find($input['post_id']) ?? throw new ContentRefused('not_found', 'This post no longer exists.', 404);
                ContentWork::where('post_id', $post->id)->whereIn('status', ['queued', 'running'])->get()->each(fn ($w) => $this->expire($w));
                if (ContentWork::where('post_id', $post->id)->whereIn('status', ['queued', 'running'])->exists()) {
                    throw new ContentRefused('already_generating', 'AI work is already running for this post.', 409);
                }
            } else {
                $this->assertSlot($input);
            }
            if (isset($input['template_id'])) {
                ContentTemplates::find($profile, (int) $input['template_id']);
            }
            $created = true;

            return ContentWork::create([
                'organization_id' => $orgId, 'brand_id' => $brandId, 'requester_id' => $user->id,
                'post_id' => $post?->id, 'post_revision' => $post?->updated_at?->toISOString(),
                'action' => $input['action'], 'request_key' => $input['request_key'], 'input' => $input, 'status' => 'queued',
            ]);
        }, 3);
        if ($created) {
            try {
                RunContentWork::dispatch((int) $row->id);
            } catch (\Throwable $e) {
                report($e);
                $this->fail((int) $row->id);
            }
        }

        return $row->fresh();
    }

    public function cancel(ContentWork $row, User $user): ContentWork
    {
        if ((int) $row->requester_id !== (int) $user->id && ! ContentAccess::canManage($user)) {
            throw new ContentRefused('not_yours', 'Only the requester or a manager can cancel this work.', 403);
        }

        return DB::transaction(function () use ($row) {
            $current = ContentWork::whereKey($row->id)->lockForUpdate()->firstOrFail();
            if (in_array($current->status, ['queued', 'running'], true)) {
                $current->update(['status' => 'cancelled', 'cancelled_at' => now(), 'finished_at' => now(), 'owner' => null]);
            }

            return $current;
        });
    }

    public function execute(ContentWork $row, string $owner): void
    {
        $guard = function (bool $commit) use ($row, $owner) {
            $query = ContentWork::whereKey($row->id);
            if ($commit) {
                $query->lockForUpdate();
            }
            $current = $query->first();
            if (! $current || $current->status !== 'running' || $current->owner !== $owner
                || ! $current->started_at || $current->started_at->addSeconds(self::RUN_SECONDS)->isPast()) {
                throw new ContentRefused('cancelled', 'This work is no longer running.', 409);
            }
        };
        (new ContentExecution((int) $row->organization_id, (int) $row->brand_id, (int) $row->requester_id, false, $guard,
            new CalendarGenerationBudget(null, 100)))->run(function () use ($row) {
                $input = $row->input;
                $post = $row->post_id ? ContentPlannerPost::find($row->post_id) : null;
                if ($row->action !== 'fill') {
                    if (! $post) {
                        throw new ContentRefused('not_found', 'This post no longer exists.', 404);
                    }
                    ContentPostWrites::assertFresh($post, $row->post_revision);
                }
                $result = ['post_id' => $post?->id];
                switch ($row->action) {
                    case 'write':
                        $template = isset($input['template_id']) ? ContentTemplates::find(ContentContext::requireProfile(), (int) $input['template_id']) : null;
                        app(ContentPostGenerationService::class)->generate($post, $input['instructions'] ?? null, $template);
                        break;
                    case 'rewrite':
                        $v = app(ContentPostGenerationService::class)->generateAlternatives($post, $input['type'], $input['guidance'] ?? null)['variation'];
                        $result['variation'] = ['id' => (int) $v->id, 'type' => (string) $v->variation_type, 'copy' => (string) $v->copy];
                        break;
                    case 'quality': $result['quality'] = app(ContentQualityService::class)->check($post);
                        break;
                    case 'brief': app(ContentVisualBriefService::class)->generateFor($post);
                        break;
                    case 'image': app(ImageGenerationService::class)->generateForPost($post, $input['instructions'] ?? null);
                        break;
                    case 'fill':
                        $this->assertSlot($input);
                        $profile = ContentContext::requireProfile();
                        $made = app(ContentAiGate::class)->oneGenerationAtATime((int) $row->organization_id, (int) $row->brand_id,
                            fn () => app(ContentCalendarGenerationService::class)->generate($profile, $input['date'], $input['date'],
                                ['platforms' => [$input['platform']], 'fill_empty_only' => true], ContentExecution::budget()));
                        $result['post_id'] = $made['created'][0]->id ?? null;
                        if (! $result['post_id']) {
                            $reason = $made['failed_windows'][0]['reason'] ?? null;
                            // Calendar returns local refusals rather than throwing them; never expose an unknown reason.
                            $safeReasons = ['ai_model_unpriced', 'ai_budget_used_up', 'ai_busy', 'access_revoked', 'subscription_required',
                                'workspace_disabled', 'no_brand', 'brand_not_allowed', 'manager_only', 'range_in_past',
                                'cancelled', 'provider_unavailable', 'time_budget_exceeded', 'invalid_ai_response'];
                            throw new ContentRefused(in_array($reason, $safeReasons, true) ? $reason : 'ai_failed', 'No post could be written for this slot.', 502);
                        }
                        break;
                }
                DB::transaction(function () use ($row, $result) {
                    ContentExecution::check(true);
                    ContentWork::whereKey($row->id)->update(['status' => 'succeeded', 'post_id' => $result['post_id'], 'result' => $result, 'finished_at' => now(), 'owner' => null]);
                });
            });
    }

    private function assertSlot(array $input): void
    {
        $profile = ContentContext::requireProfile();
        $slots = ContentPlan::openSlots($profile, $input['date'], $input['date'], VenueClock::today((int) $profile->organization_id));
        if (! in_array(['date' => $input['date'], 'platform' => $input['platform']], $slots, true)) {
            throw new ContentRefused('slot_not_open', 'This slot is no longer open.', 422);
        }
    }

    public function fail(int $id, string $code = 'ai_failed', ?string $owner = null): void
    {
        ContentWork::withoutGlobalScopes()->whereKey($id)->whereIn('status', ['queued', 'running'])
            ->when($owner, fn ($q) => $q->where('owner', $owner))
            ->update(['status' => 'failed', 'error' => $code, 'finished_at' => now(), 'owner' => null]);
    }

    public function expire(ContentWork $row): void
    {
        $limit = $row->status === 'queued' ? $row->created_at?->addSeconds(1800) : $row->started_at?->addSeconds(self::RUN_SECONDS);
        if (in_array($row->status, ['queued', 'running'], true) && (! $limit || $limit->isPast())) {
            // A poll that read queued must not expire a worker which claimed it meanwhile.
            ContentWork::withoutGlobalScopes()->whereKey($row->id)->where('status', $row->status)->where('owner', $row->owner)
                ->update(['status' => 'failed', 'error' => 'ai_failed', 'finished_at' => now(), 'owner' => null]);
        }
    }

    public function describe(ContentWork $row): array
    {
        $this->expire($row);
        $row->refresh();
        $viewer = auth()->user();
        $canCancel = in_array($row->status, ['queued', 'running'], true) && $viewer
            && ((int) $row->requester_id === (int) $viewer->id || ContentAccess::canManage($viewer));

        return ['id' => (int) $row->id, 'action' => $row->action, 'status' => $row->status, 'post_id' => $row->post_id ? (int) $row->post_id : null,
            'started_at' => $row->started_at?->toISOString(), 'finished_at' => $row->finished_at?->toISOString(), 'error' => $row->error, 'result' => $row->result,
            'can_cancel' => $canCancel];
    }
}
