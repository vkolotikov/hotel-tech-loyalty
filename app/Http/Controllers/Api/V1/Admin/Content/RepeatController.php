<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\RewriteRepeatCopies;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRepeat;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Repeat posts (spec 2026-10-15 §8): everyone may repeat a post (everyone writes posts) and stop a series. */
class RepeatController extends Controller
{
    public function store(Request $request, int $id, ContentAiGate $gate): JsonResponse
    {
        $data = $request->validate([
            'every'      => ['required', Rule::in(ContentRepeat::EVERY)],
            'until'      => 'required|date_format:Y-m-d',
            'ai_rewrite' => 'sometimes|boolean',
        ]);
        $post = PostController::find($id);
        if ($post->series_id !== null) {
            throw new ContentRefused('already_repeating', 'This post already repeats.', 409);
        }
        if ($post->scheduled_date === null) {
            throw new ContentRefused('no_day', 'A post repeats from its day: give it one first.', 422);
        }
        $from = $post->scheduled_date->format('Y-m-d');
        if ($data['until'] > CarbonImmutable::parse($from)->addMonthsNoOverflow(ContentRepeat::MAX_MONTHS)->toDateString()) {
            throw ValidationException::withMessages(['until' => 'A post repeats for at most ' . ContentRepeat::MAX_MONTHS . ' months.']);
        }
        $dates = ContentRepeat::dates($from, $data['every'], $data['until'], VenueClock::today(ContentContext::orgId()));
        if ($dates === []) {
            throw ValidationException::withMessages(['until' => 'There is no day to repeat on before that date.']);
        }
        if (count($dates) > ContentRepeat::MAX_COPIES) {
            throw ValidationException::withMessages(['until' => 'A post repeats at most ' . ContentRepeat::MAX_COPIES . ' times.']);
        }
        if ($request->boolean('ai_rewrite') && count($dates) > ContentRepeat::MAX_AI_COPIES) {
            throw ValidationException::withMessages(['ai_rewrite' => 'The AI rewrites at most ' . ContentRepeat::MAX_AI_COPIES . ' copies.']);
        }
        if ($request->boolean('ai_rewrite')) {
            // At the budget cap nothing is made: the person asked for reworded copies.
            $gate->allow($request->attributes->get('workspace_org'));
        }

        $copies = ContentRepeat::copy($post, $dates, $request->user()->id);
        if ($request->boolean('ai_rewrite')) {
            // The panel shows "rewording…" until the job forgets this (or 15 minutes pass).
            Cache::put(ContentRepeat::rewritingKey((int) $post->id), true, now()->addMinutes(15));
            RewriteRepeatCopies::dispatch((int) $post->id, ContentContext::orgId(), ContentContext::brandId(), $copies->pluck('id')->map(fn ($copyId) => (int) $copyId)->all());
        }

        return response()->json([
            'post'   => ContentPostPresenter::detail($post->fresh(PostController::WITH)),
            'copies' => $copies->map(fn ($copy) => ContentPostPresenter::card($copy))->values(),
        ], 201);
    }

    public function destroy(int $id): JsonResponse
    {
        $post = PostController::find($id);
        $removed = $post->series_id ? ContentRepeat::stop((int) $post->series_id, VenueClock::today(ContentContext::orgId())) : 0;
        $kept = $post->fresh(PostController::WITH);

        return response()->json(['removed' => $removed, 'post' => $kept ? ContentPostPresenter::detail($kept) : null]);
    }
}
