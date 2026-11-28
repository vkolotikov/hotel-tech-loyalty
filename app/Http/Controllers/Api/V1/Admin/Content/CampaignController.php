<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerCampaign;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CampaignController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['campaigns' => ContentPlannerCampaign::query()->orderByDesc('id')->get()->map(self::describe(...))]);
    }

    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $fields = $this->fields($request, true);
        $this->dates($fields);
        $campaign = ContentPlannerCampaign::create($fields + ['planner_profile_id' => $profile->id, 'status' => 'draft']);

        return response()->json(['campaign' => self::describe($campaign)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $fields = $this->fields($request, false);
        $campaign = DB::transaction(function () use ($fields, $id) {
            $campaign = ContentPlannerCampaign::whereKey($id)->lockForUpdate()->first()
                ?? throw new ContentRefused('not_found', 'This campaign no longer exists.', 404);
            $this->dates($fields + ['start_date' => $campaign->start_date?->format('Y-m-d'), 'end_date' => $campaign->end_date?->format('Y-m-d')]);
            $campaign->update($fields);

            // Historical links are snapshots; renaming/archiving never rewrites them.
            return $campaign;
        });

        return response()->json(['campaign' => self::describe($campaign)]);
    }

    private function fields(Request $request, bool $create): array
    {
        $fields = $request->validate([
            'name' => ($create ? 'required' : 'sometimes').'|string|max:255',
            'goal' => 'sometimes|nullable|string|max:5000',
            'brief' => 'sometimes|nullable|string|max:10000',
            'start_date' => 'sometimes|nullable|date_format:Y-m-d',
            'end_date' => 'sometimes|nullable|date_format:Y-m-d',
            'status' => ['sometimes', Rule::in(['draft', 'active', 'paused', 'completed', 'archived'])],
        ]);
        if (array_key_exists('brief', $fields)) {
            $fields['notes'] = $fields['brief'];
            unset($fields['brief']);
        }

        return $fields;
    }

    private function dates(array $fields): void
    {
        if (($fields['start_date'] ?? null) && ($fields['end_date'] ?? null) && $fields['end_date'] < $fields['start_date']) {
            throw ValidationException::withMessages(['end_date' => 'The end date must be on or after the start date.']);
        }
    }

    public static function describe(ContentPlannerCampaign $c): array
    {
        return ['id' => (int) $c->id, 'name' => $c->name, 'goal' => $c->goal, 'brief' => $c->notes,
            'start_date' => $c->start_date?->format('Y-m-d'), 'end_date' => $c->end_date?->format('Y-m-d'), 'status' => $c->status];
    }
}
