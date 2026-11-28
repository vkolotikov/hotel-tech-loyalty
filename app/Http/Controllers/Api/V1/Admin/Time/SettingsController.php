<?php

namespace App\Http\Controllers\Api\V1\Admin\Time;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CrmSetting;
use App\Services\Time\Knowledge;
use App\Services\Time\PlanningMode;
use App\Services\Time\Recognition;
use App\Services\Time\TimeAccess;
use App\Services\Time\TimeRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The planner's settings as HexaTech Time Planner keeps them (2026-11-09): the same `crm_settings` rows the full admin's
 * Planner reads and writes, in its shapes, but only the planner's keys — so an organisation that bought the Time
 * Planner alone (AccessMap product `time`) never needs the CRM's settings area (`crm-settings`, product `crm`).
 *
 * Reads are everyone's (the planner lists them all); a change is a manager's (AccessMap `admin/time/settings`, and
 * TimeAccess here as well, since the planning mode decides what everyone else may do).
 *
 * Since 2026-11-14 also what a manager teaches the AI (Knowledge: the business, house rules and goals; notes and
 * typical lengths per task type and per task), answered and saved cleaned, as objects.
 *
 * Since 2026-11-28 also recognition (Recognition): who sees the week's ranking (`planner_recognition`, its change
 * audited) and how many finished tasks make the daily goal (`planner_daily_goal`).
 */
class SettingsController extends Controller
{
    /** The keys this endpoint answers; all but `employees` (the full admin's assign list) are written here too. */
    public const KEYS = [
        'business_hours_profile', 'planner_work_hours_per_day', 'planner_work_days_per_week',
        'planner_groups', 'planner_channels', 'planner_employee_prefs', PlanningMode::KEY, 'employees',
        Knowledge::CONTEXT, Knowledge::TYPE_NOTES, Knowledge::TASK_NOTES,
        Recognition::KEY, Recognition::GOAL_KEY,
    ];

    public const WRITABLE = [
        'business_hours_profile', 'planner_work_hours_per_day', 'planner_work_days_per_week',
        'planner_groups', 'planner_channels', 'planner_employee_prefs', PlanningMode::KEY,
        Knowledge::CONTEXT, Knowledge::TYPE_NOTES, Knowledge::TASK_NOTES,
        Recognition::KEY, Recognition::GOAL_KEY,
    ];

    /** The longest list a setting may hold, as JSON text (the full admin's lists are a few kB). */
    private const MAX_LIST_BYTES = 200_000;

    public function index(): JsonResponse
    {
        $rows = CrmSetting::query()->whereIn('key', self::KEYS)->pluck('value', 'key')->all();
        $rows[PlanningMode::KEY] = PlanningMode::read($rows[PlanningMode::KEY] ?? null);
        $knowledge = new Knowledge();
        $rows[Knowledge::CONTEXT] = $knowledge->context();
        $rows[Knowledge::TYPE_NOTES] = (object) $knowledge->typeNotes();
        $rows[Knowledge::TASK_NOTES] = (object) $knowledge->taskNotes();
        // Recognition (2026-11-28): who sees the week's ranking, and how many finished tasks make the daily goal.
        $rows[Recognition::KEY] = Recognition::readMode($rows[Recognition::KEY] ?? null);
        $rows[Recognition::GOAL_KEY] = Recognition::readGoal($rows[Recognition::GOAL_KEY] ?? null);

        return response()->json($rows);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        if (!in_array($key, self::WRITABLE, true)) {
            throw TimeRefused::notFound();
        }
        TimeAccess::assertManager($request->user());

        $value = match ($key) {
            PlanningMode::KEY => $request->validate(['value' => 'required|string|in:' . implode(',', PlanningMode::MODES)])['value'],
            Recognition::KEY => $request->validate(['value' => 'required|string|in:' . implode(',', Recognition::MODES)])['value'],
            Recognition::GOAL_KEY => (int) $request->validate(['value' => 'required|integer|min:1|max:' . Recognition::GOAL_MAX])['value'],
            'planner_work_hours_per_day' => (float) $request->validate(['value' => 'required|numeric|min:1|max:24'])['value'],
            'planner_work_days_per_week' => (int) $request->validate(['value' => 'required|integer|min:1|max:7'])['value'],
            // The only shape the server reads (WorkWindow): {start, end}, HH:MM, the end after the start.
            'business_hours_profile' => (function () use ($request) {
                $v = $request->validate([
                    'value'       => 'required|array',
                    'value.start' => 'required|date_format:H:i',
                    'value.end'   => 'required|date_format:H:i|after:value.start',
                ])['value'];

                return ['start' => $v['start'], 'end' => $v['end']];
            })(),
            Knowledge::CONTEXT => json_encode(Knowledge::cleanContext($this->objectValue($request)), JSON_UNESCAPED_UNICODE),
            Knowledge::TYPE_NOTES => json_encode((object) Knowledge::cleanTypeNotes($this->objectValue($request)), JSON_UNESCAPED_UNICODE),
            Knowledge::TASK_NOTES => json_encode((object) Knowledge::cleanTaskNotes($this->objectValue($request)), JSON_UNESCAPED_UNICODE),
            default => $this->listValue($request),
        };

        $before = CrmSetting::query()->where('key', $key)->value('value');
        CrmSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        if ($key === PlanningMode::KEY && PlanningMode::read($before) !== $value) {
            AuditLog::record('planner.planning_mode', null, ['mode' => $value], ['mode' => PlanningMode::read($before)], $request->user(),
                $value === PlanningMode::OWN ? 'Planner: everyone plans only their own day' : 'Planner: everyone may plan for the team');
        }

        // Who sees the ranking decides what colleagues learn about each other: the change is on record.
        if ($key === Recognition::KEY && Recognition::readMode($before) !== $value) {
            AuditLog::record('planner.recognition', null, ['mode' => $value], ['mode' => Recognition::readMode($before)], $request->user(),
                'Planner recognition: ' . match ($value) {
                    Recognition::RANKING => 'everyone sees the week\'s ranking',
                    Recognition::PODIUM  => 'everyone sees the top three and their own place',
                    Recognition::OWN     => 'everyone sees only their own points',
                    default              => 'switched off',
                });
        }

        return response()->json(['key' => $key, 'value' => match (true) {
            $key === PlanningMode::KEY, $key === Recognition::KEY, $key === Recognition::GOAL_KEY => $value,
            in_array($key, Knowledge::KEYS, true) => json_decode((string) $value),
            default => CrmSetting::query()->where('key', $key)->value('value'),
        }]);
    }

    /**
     * What a manager teaches the AI: an object sent as JSON, or as JSON text.
     *
     * @return array<mixed>
     */
    private function objectValue(Request $request): array
    {
        $raw = $request->input('value');
        if (is_string($raw)) {
            if (strlen($raw) > self::MAX_LIST_BYTES) {
                throw new TimeRefused('invalid', 'The setting is too long.', 422);
            }
            $raw = json_decode($raw, true);
        }
        if (!is_array($raw)) {
            throw new TimeRefused('invalid', 'The setting is not something the planner can read.', 422);
        }

        return $raw;
    }

    /**
     * A list (task types, tasks, preferences) as the full admin keeps it: JSON text, which its parsers and
     * PlannerCatalogue read, or a list sent as JSON, kept as text the same way.
     */
    private function listValue(Request $request): string
    {
        $raw = $request->input('value');
        if (is_array($raw)) {
            $raw = json_encode($raw, JSON_UNESCAPED_UNICODE);
        }
        if (!is_string($raw) || strlen($raw) > self::MAX_LIST_BYTES || !is_array(json_decode($raw, true))) {
            throw new TimeRefused('invalid', 'The setting is not a list the planner can read.', 422);
        }

        return $raw;
    }
}
