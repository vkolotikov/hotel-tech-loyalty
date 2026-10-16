<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerKeyDate;
use App\Models\ContentPlannerProfile;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentKeyDates;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The brand's own key dates (spec 2026-10-16 §3.1): events of up to 31 days and one-day notes. Anyone on the team
 * adds, edits and deletes them, past days included.
 */
class KeyDateController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $data = $request->validate(ContentRules::keyDateFields(true));
        $data['end_date'] = self::lastDay($data['kind'], $data['start_date'], $data['end_date'] ?? null);
        if ($profile->keyDates()->count() >= ContentPlannerKeyDate::MAX) {
            throw new ContentRefused('too_many_key_dates', 'A brand keeps at most 1,000 events and notes.', 422);
        }
        $keyDate = $profile->keyDates()->create($data + ['brand_id' => $profile->brand_id, 'created_by' => $request->user()->id]);

        return response()->json(['key_date' => ContentKeyDates::own($keyDate)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $keyDate = self::find($profile, $id);
        $data = $request->validate(ContentRules::keyDateFields(false));
        $start = $data['start_date'] ?? (string) ContentKeyDates::day($keyDate->start_date);
        $end = array_key_exists('end_date', $data) ? $data['end_date'] : ContentKeyDates::day($keyDate->end_date);
        $data['end_date'] = self::lastDay((string) $keyDate->kind, $start, $end);
        $keyDate->fill($data)->save();

        return response()->json(['key_date' => ContentKeyDates::own($keyDate->fresh())]);
    }

    public function destroy(int $id): JsonResponse
    {
        self::find(ContentContext::requireProfile(), $id)->delete();

        return response()->json(['deleted' => true]);
    }

    /** The last day as stored: null for one day (every note); an event's never before its first, at most 31 days on. */
    private static function lastDay(string $kind, string $start, ?string $end): ?string
    {
        if ($end === null || $end === $start) {
            return null;
        }
        if ($kind === 'note') {
            throw ValidationException::withMessages(['end_date' => 'A note is on one day.']);
        }
        if ($end < $start) {
            throw ValidationException::withMessages(['end_date' => 'The last day cannot be before the first.']);
        }
        if (ContentRules::days($start, $end) > ContentPlannerKeyDate::MAX_EVENT_DAYS) {
            throw ValidationException::withMessages(['end_date' => 'An event lasts at most 31 days.']);
        }

        return $end;
    }

    private static function find(ContentPlannerProfile $profile, int $id): ContentPlannerKeyDate
    {
        return $profile->keyDates()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This key date no longer exists.', 404);
    }
}
