<?php

namespace App\Http\Controllers\Api\V1\Admin\Time;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Time\Assistant;
use App\Services\Time\Coach;
use App\Services\Time\Learning;
use App\Services\Time\PlannerAi;
use App\Services\Time\TimeAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech Time Planner's AI assistant and coach (2026-11-14), under `admin/time/*` behind `workspace:time` and the
 * plan's `time_management`:
 *
 * - `POST assistant` — one turn of the conversation (Assistant): its reply and the changes it proposes, each already
 *   checked against the asking person's rights and handed back as the planner call that applies it. Everyone's.
 * - `GET coach` — what the AI knows and lacks, what the planner learned (a staff member sees their own figures only),
 *   and what a manager taught it. Everyone's.
 * - `POST coach/strategy` and `POST coach/draft` — the AI's strategy for the team and its drafts of what to teach it:
 *   a manager's (AccessMap and here).
 *
 * The month's AI allowance is asked first; nothing here writes.
 */
class AssistantController extends Controller
{
    public function turn(Request $request, Assistant $assistant, PlannerAi $ai): JsonResponse
    {
        $data = $request->validate([
            'messages'           => 'required|array|min:1|max:' . Assistant::HISTORY_MAX,
            'messages.*.role'    => 'required|string|in:user,assistant',
            'messages.*.content' => 'required|string|max:' . Assistant::MESSAGE_MAX,
            'lang'               => 'nullable|string|in:en,ru,de,fr,es',
        ]);
        $messages = array_values(array_map(fn ($m) => ['role' => $m['role'], 'content' => trim($m['content'])], $data['messages']));
        if (end($messages)['role'] !== 'user' || end($messages)['content'] === '') {
            return response()->json(['error' => 'invalid', 'message' => 'The last message must be the person\'s.'], 422);
        }
        // The conversation starts with the person (a reply the client kept from before cannot come first).
        while ($messages !== [] && $messages[0]['role'] !== 'user') {
            array_shift($messages);
        }
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $ai->assertReady($org);

        return response()->json($assistant->turn($org, $request->user(), $messages, $data['lang'] ?? 'en'));
    }

    public function coach(Request $request, Coach $coach): JsonResponse
    {
        $weeks = (int) ($request->validate(['weeks' => 'nullable|integer|between:1,' . Learning::MAX_WEEKS])['weeks'] ?? 0) ?: Learning::WEEKS;

        return response()->json($coach->overview((int) $request->attributes->get('workspace_org')->id, $request->user(), $weeks));
    }

    public function strategy(Request $request, Coach $coach, PlannerAi $ai): JsonResponse
    {
        TimeAccess::assertManager($request->user());
        $data = $request->validate(['weeks' => 'nullable|integer|between:1,' . Learning::MAX_WEEKS, 'lang' => 'nullable|string|in:en,ru,de,fr,es']);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $ai->assertReady($org);

        return response()->json($coach->strategy($org, (int) ($data['weeks'] ?? Learning::WEEKS), $data['lang'] ?? 'en'));
    }

    public function draft(Request $request, Coach $coach, PlannerAi $ai): JsonResponse
    {
        TimeAccess::assertManager($request->user());
        $data = $request->validate(['kind' => 'required|string|in:people,types,business', 'lang' => 'nullable|string|in:en,ru,de,fr,es']);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $ai->assertReady($org);

        return response()->json($coach->draft($org, $data['kind'], $data['lang'] ?? 'en'));
    }
}
