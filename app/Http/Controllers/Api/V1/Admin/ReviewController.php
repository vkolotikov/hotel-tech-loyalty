<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ReviewDevice;
use App\Models\ReviewForm;
use App\Models\ReviewFormQuestion;
use App\Models\ReviewFormStat;
use App\Models\ReviewIntegration;
use App\Models\ReviewInvitation;
use App\Models\ReviewSubmission;
use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Services\ReviewInvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReviewController extends Controller
{
    private const QUESTION_KINDS = [
        'text', 'textarea', 'stars', 'scale', 'nps',
        'single_choice', 'multi_choice', 'boolean', 'emoji',
    ];

    private const CONDITION_OPERATORS = [
        'eq', 'neq', 'gte', 'lte', 'contains', 'any_of',
    ];

    private const PLATFORMS = ['google', 'trustpilot', 'tripadvisor', 'facebook'];

    // ─── Forms ──────────────────────────────────────────────────────────────

    public function listForms(): JsonResponse
    {
        $forms = ReviewForm::withCount(['questions', 'submissions'])
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return response()->json(['forms' => $forms]);
    }

    public function showForm(int $id): JsonResponse
    {
        $form = ReviewForm::with('questions')->findOrFail($id);

        return response()->json([
            'form' => $form,
            'submission_count' => $form->submissions()->count(),
            'invitation_count' => $form->invitations()->count(),
        ]);
    }

    public function createForm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'      => 'required|string|max:255',
            'type'      => 'required|in:basic,custom',
            'is_active' => 'nullable|boolean',
            'config'    => 'nullable|array',
        ]);

        $form = ReviewForm::create(array_merge($data, [
            'embed_key' => Str::random(32),
            'is_active' => $data['is_active'] ?? true,
            'config'    => $data['config'] ?? $this->defaultConfig($data['type']),
        ]));

        return response()->json(['form' => $form], 201);
    }

    public function updateForm(Request $request, int $id): JsonResponse
    {
        $form = ReviewForm::findOrFail($id);

        $data = $request->validate([
            'name'       => 'sometimes|string|max:255',
            'is_active'  => 'sometimes|boolean',
            'is_default' => 'sometimes|boolean',
            'config'     => 'sometimes|array',
        ]);

        // Only one default per org — demote others if this becomes default.
        if (($data['is_default'] ?? false) && !$form->is_default) {
            ReviewForm::where('id', '!=', $form->id)
                ->where('is_default', true)
                ->update(['is_default' => false]);
        }

        $form->update($data);

        return response()->json(['form' => $form->fresh()]);
    }

    public function deleteForm(int $id): JsonResponse
    {
        $form = ReviewForm::findOrFail($id);

        if ($form->is_default) {
            return response()->json(['message' => 'Cannot delete the default form'], 422);
        }

        $form->delete();

        return response()->json(['ok' => true]);
    }

    public function rotateEmbedKey(int $id): JsonResponse
    {
        $form = ReviewForm::findOrFail($id);
        $form->update(['embed_key' => Str::random(32)]);

        return response()->json(['embed_key' => $form->embed_key]);
    }

    // ─── Questions (replace-all) ────────────────────────────────────────────

    public function replaceQuestions(Request $request, int $formId): JsonResponse
    {
        $form = ReviewForm::findOrFail($formId);

        $data = $request->validate([
            'questions'                 => 'required|array',
            'questions.*.kind'          => 'required|in:' . implode(',', self::QUESTION_KINDS),
            'questions.*.label'         => 'required|string|max:500',
            'questions.*.help_text'     => 'nullable|string|max:1000',
            'questions.*.options'       => 'nullable|array',
            'questions.*.required'      => 'nullable|boolean',
            'questions.*.weight'        => 'nullable|integer|min:1|max:10',
            'questions.*.condition_index'    => 'nullable|integer|min:0',
            'questions.*.condition_operator' => 'nullable|in:' . implode(',', self::CONDITION_OPERATORS),
            'questions.*.condition_value'    => 'nullable',
        ]);

        // Wipe + re-insert keeps ordering simple. Historical submissions'
        // answers JSON is self-contained so orphaned question_ids don't break
        // the detail view — the submission keeps its own label snapshot via
        // the answers payload, not a FK.
        $form->questions()->delete();

        foreach ($data['questions'] as $idx => $q) {
            // Normalize condition_value — accept scalar or array, store as array/null.
            $condVal = $q['condition_value'] ?? null;
            if ($condVal !== null && !is_array($condVal)) {
                $condVal = [$condVal];
            }

            $hasCondition = isset($q['condition_index'])
                && isset($q['condition_operator'])
                && $q['condition_index'] < $idx; // only backward refs

            ReviewFormQuestion::create([
                'form_id'            => $form->id,
                'order'              => $idx,
                'kind'               => $q['kind'],
                'label'              => $q['label'],
                'help_text'          => $q['help_text'] ?? null,
                'options'            => $q['options'] ?? null,
                'required'           => $q['required'] ?? false,
                'weight'             => $q['weight'] ?? 1,
                'condition_index'    => $hasCondition ? $q['condition_index'] : null,
                'condition_operator' => $hasCondition ? $q['condition_operator'] : null,
                'condition_value'    => $hasCondition ? $condVal : null,
            ]);
        }

        return response()->json([
            'questions' => $form->questions()->orderBy('order')->get(),
        ]);
    }

    // ─── Integrations ───────────────────────────────────────────────────────

    public function listIntegrations(): JsonResponse
    {
        return response()->json([
            'integrations' => ReviewIntegration::orderBy('platform')->get(),
            'platforms'    => self::PLATFORMS,
        ]);
    }

    public function upsertIntegration(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform'         => 'required|in:' . implode(',', self::PLATFORMS),
            'display_name'     => 'nullable|string|max:255',
            'write_review_url' => 'required|url|max:1024',
            'place_id'         => 'nullable|string|max:255',
            'is_enabled'       => 'nullable|boolean',
        ]);

        $orgId = app('current_organization_id');

        $integration = ReviewIntegration::updateOrCreate(
            ['organization_id' => $orgId, 'platform' => $data['platform']],
            array_merge($data, ['is_enabled' => $data['is_enabled'] ?? true]),
        );

        return response()->json(['integration' => $integration]);
    }

    public function deleteIntegration(int $id): JsonResponse
    {
        ReviewIntegration::findOrFail($id)->delete();

        return response()->json(['ok' => true]);
    }

    // ─── Submissions ────────────────────────────────────────────────────────

    public function listSubmissions(Request $request): JsonResponse
    {
        $query = ReviewSubmission::with(['form:id,name,type', 'member.user:id,name', 'guest:id,full_name']);

        if ($formId = $request->query('form_id')) {
            $query->where('form_id', $formId);
        }
        if ($rating = $request->query('rating')) {
            $query->where('overall_rating', (int) $rating);
        }
        if ($request->query('redirected') === 'yes') {
            $query->where('redirected_externally', true);
        }
        if ($request->query('redirected') === 'no') {
            $query->where('redirected_externally', false);
        }
        if ($search = $request->query('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('comment', 'ilike', "%{$search}%")
                  ->orWhere('anonymous_name', 'ilike', "%{$search}%")
                  ->orWhere('anonymous_email', 'ilike', "%{$search}%");
            });
        }

        $submissions = $query->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->paginate(25);

        return response()->json($submissions);
    }

    public function exportSubmissions(Request $request): StreamedResponse
    {
        $query = ReviewSubmission::with(['form:id,name,type', 'member.user:id,name', 'guest:id,full_name']);

        if ($formId = $request->query('form_id'))      $query->where('form_id', $formId);
        if ($rating = $request->query('rating'))       $query->where('overall_rating', (int) $rating);
        if ($request->query('redirected') === 'yes')    $query->where('redirected_externally', true);
        if ($request->query('redirected') === 'no')     $query->where('redirected_externally', false);
        if ($from = $request->query('date_from'))       $query->where('submitted_at', '>=', $from);
        if ($to = $request->query('date_to'))           $query->where('submitted_at', '<=', $to . ' 23:59:59');
        if ($search = $request->query('q')) {
            $query->where(function ($q) use ($search) {
                $q->where('comment', 'ilike', "%{$search}%")
                  ->orWhere('anonymous_name', 'ilike', "%{$search}%")
                  ->orWhere('anonymous_email', 'ilike', "%{$search}%");
            });
        }

        $query->orderByDesc('submitted_at')->orderByDesc('id');

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [
                'ID', 'Submitted At', 'Form', 'Form Type', 'Overall Rating', 'NPS',
                'Respondent', 'Email', 'Comment', 'Redirected', 'Platform', 'Invitation ID',
            ]);

            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $s) {
                    $respondent = $s->member?->user?->name
                        ?? $s->guest?->full_name
                        ?? $s->anonymous_name
                        ?? '';
                    $email = $s->guest?->email ?? $s->anonymous_email ?? '';
                    fputcsv($out, [
                        $s->id,
                        $s->submitted_at?->toDateTimeString(),
                        $s->form?->name,
                        $s->form?->type,
                        $s->overall_rating,
                        $s->nps_score,
                        $respondent,
                        $email,
                        $s->comment ? preg_replace('/\s+/', ' ', $s->comment) : '',
                        $s->redirected_externally ? 'yes' : 'no',
                        $s->external_platform,
                        $s->invitation_id,
                    ]);
                }
            });
            fclose($out);
        }, 'reviews-' . date('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    public function showSubmission(int $id): JsonResponse
    {
        $submission = ReviewSubmission::with([
            'form.questions',
            'member.user',
            'member.tier',
            'guest',
            'invitation',
        ])->findOrFail($id);

        return response()->json(['submission' => $submission]);
    }

    // ─── Stats ──────────────────────────────────────────────────────────────

    public function stats(Request $request): JsonResponse
    {
        $days = (int) $request->query('days', 30);
        $since = now()->subDays($days);

        $submissions = ReviewSubmission::where('submitted_at', '>=', $since)->get();
        $invitations = ReviewInvitation::where('created_at', '>=', $since)->get();

        $withRating = $submissions->whereNotNull('overall_rating');
        $avgRating = $withRating->count() > 0
            ? round($withRating->avg('overall_rating'), 2)
            : 0;

        // Rating distribution 1..5
        $distribution = [];
        for ($i = 1; $i <= 5; $i++) {
            $distribution[$i] = $withRating->where('overall_rating', $i)->count();
        }

        // NPS
        $withNps = $submissions->whereNotNull('nps_score');
        $nps = 0;
        if ($withNps->count() > 0) {
            $promoters  = $withNps->filter(fn($s) => $s->nps_score >= 9)->count();
            $detractors = $withNps->filter(fn($s) => $s->nps_score <= 6)->count();
            $nps = round(($promoters - $detractors) / $withNps->count() * 100, 1);
        }

        // Funnel
        $invited   = $invitations->count();
        $opened    = $invitations->whereIn('status', ['opened', 'submitted', 'redirected'])->count();
        $submitted = $invitations->whereIn('status', ['submitted', 'redirected'])->count();
        $redirected = $submissions->where('redirected_externally', true)->count();

        // Daily submission volume
        $timeline = $submissions
            ->groupBy(fn($s) => optional($s->submitted_at ?? $s->created_at)->format('Y-m-d'))
            ->map(fn($bucket, $day) => [
                'day'   => $day,
                'count' => $bucket->count(),
                'avg'   => round($bucket->whereNotNull('overall_rating')->avg('overall_rating') ?? 0, 2),
            ])
            ->values();

        return response()->json([
            'avg_rating'    => $avgRating,
            'total'         => $submissions->count(),
            'nps'           => $nps,
            'distribution'  => $distribution,
            'funnel'        => [
                'invited'    => $invited,
                'opened'     => $opened,
                'submitted'  => $submitted,
                'redirected' => $redirected,
            ],
            'timeline'      => $timeline,
        ]);
    }

    private function defaultConfig(string $type): array
    {
        return $type === 'basic'
            ? [
                'intro_text'         => 'We hope you enjoyed your stay. Your feedback helps us improve.',
                'thank_you_text'     => 'Thank you for taking the time to share your experience.',
                'ask_for_comment'    => true,
                'allow_anonymous'    => true,
                'redirect_threshold' => 4,
                'redirect_prompt'    => 'Would you share this on a review site?',
            ]
            : [
                'intro_text'      => 'Help us improve by answering a few quick questions.',
                'thank_you_text'  => 'Thank you for your feedback.',
                'allow_anonymous' => true,
            ];
    }

    // ─── Invitations ─────────────────────────────────────────────────────────

    public function listInvitations(Request $request): JsonResponse
    {
        $q = ReviewInvitation::with([
                'form:id,name,type',
                'guest:id,full_name,email',
                'member.user:id,name,email',
                'submission:id,invitation_id,overall_rating',
            ])
            ->orderByDesc('created_at');

        if ($formId = $request->query('form_id')) {
            $q->where('form_id', (int) $formId);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($channel = $request->query('channel')) {
            $q->where('channel', $channel);
        }

        return response()->json($q->paginate(50));
    }

    public function invitationFunnel(Request $request): JsonResponse
    {
        $q = ReviewInvitation::query();
        if ($formId = $request->query('form_id')) {
            $q->where('form_id', (int) $formId);
        }
        $rows = $q->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status')->all();

        return response()->json([
            'pending'    => (int) ($rows['pending']    ?? 0),
            'opened'     => (int) ($rows['opened']     ?? 0),
            'submitted'  => (int) ($rows['submitted']  ?? 0),
            'redirected' => (int) ($rows['redirected'] ?? 0),
            'failed'     => (int) ($rows['failed']     ?? 0),
        ]);
    }

    public function sendInvitation(Request $request, ReviewInvitationService $svc): JsonResponse
    {
        $data = $request->validate([
            'form_id'     => 'nullable|integer|exists:review_forms,id',
            'member_id'   => 'nullable|integer|exists:loyalty_members,id',
            'guest_id'    => 'nullable|integer|exists:guests,id',
            'email'       => 'nullable|email|max:255',
            'name'        => 'nullable|string|max:255',
            'subject'     => 'nullable|string|max:200',
        ]);

        $form = $data['form_id']
            ? ReviewForm::find($data['form_id'])
            : ReviewForm::where('is_default', true)->where('is_active', true)->first();

        if (!$form) {
            return response()->json(['message' => 'No form specified and no default form exists.'], 422);
        }

        $recipient = match (true) {
            !empty($data['member_id']) => LoyaltyMember::with('user')->findOrFail($data['member_id']),
            !empty($data['guest_id'])  => Guest::findOrFail($data['guest_id']),
            !empty($data['email'])     => ['name' => $data['name'] ?? null, 'email' => $data['email']],
            default                    => null,
        };

        if (!$recipient) {
            return response()->json(['message' => 'Provide member_id, guest_id, or email.'], 422);
        }

        try {
            $invitation = $svc->sendEmail($form, $recipient, array_filter([
                'subject' => $data['subject'] ?? null,
            ]));
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'ok'         => true,
            'invitation' => $invitation->load(['form:id,name', 'guest:id,full_name,email', 'member.user:id,name,email']),
        ], 201);
    }

    // ─── Kiosk devices ──────────────────────────────────────────────────────

    public function listDevices(): JsonResponse
    {
        $devices = ReviewDevice::with('form:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn ($d) => array_merge($d->toArray(), ['is_online' => $d->is_online]));

        return response()->json(['devices' => $devices]);
    }

    public function createDevice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:120',
            'location' => 'nullable|string|max:160',
            'form_id'  => 'nullable|integer',
        ]);

        // Scoped re-fetch — the raw id must belong to this org.
        if (!empty($data['form_id']) && !ReviewForm::find($data['form_id'])) {
            return response()->json(['message' => 'Unknown survey for this organization.'], 422);
        }

        $device = ReviewDevice::create(array_merge($data, [
            'device_key' => Str::random(40),
            'is_active'  => true,
        ]));

        return response()->json(['device' => $device->load('form:id,name')], 201);
    }

    public function updateDevice(Request $request, int $id): JsonResponse
    {
        $device = ReviewDevice::findOrFail($id);
        $data = $request->validate([
            'name'      => 'sometimes|string|max:120',
            'location'  => 'nullable|string|max:160',
            'form_id'   => 'nullable|integer',
            'is_active' => 'sometimes|boolean',
        ]);

        if (array_key_exists('form_id', $data) && $data['form_id'] !== null
            && !ReviewForm::find($data['form_id'])) {
            return response()->json(['message' => 'Unknown survey for this organization.'], 422);
        }

        // Reassignment bumps the form's updated_at via touch so the
        // kiosk's `version` poll notices even when only the pointer
        // changed (the version string is derived from the FORM).
        $device->update($data);
        if (array_key_exists('form_id', $data) && $device->form) {
            $device->form->touch();
        }

        return response()->json(['device' => $device->fresh('form:id,name')]);
    }

    public function deleteDevice(int $id): JsonResponse
    {
        ReviewDevice::findOrFail($id)->delete();
        return response()->json(['ok' => true]);
    }

    public function rotateDeviceKey(int $id): JsonResponse
    {
        $device = ReviewDevice::findOrFail($id);
        $device->update(['device_key' => Str::random(40)]);
        return response()->json(['device' => $device->fresh('form:id,name')]);
    }

    /**
     * GET /v1/admin/reviews/devices/{id}/qr — QR of the kiosk URL so
     * setting up a tablet is: open camera, scan, tap, go full-screen.
     */
    public function deviceQr(int $id, \App\Services\QrCodeService $qr): JsonResponse
    {
        $device = ReviewDevice::findOrFail($id);
        $url = rtrim(config('app.url'), '/') . '/k/' . $device->device_key;

        return response()->json([
            'url' => $url,
            'qr'  => $qr->urlQrDataUri($url),
        ]);
    }

    // ─── Per-survey analytics ───────────────────────────────────────────────

    /**
     * GET /v1/admin/reviews/forms/{id}/analytics?days=30
     *
     * Everything the survey Analytics tab renders in one call: totals
     * (views / submissions / completion / avg rating / NPS), a daily
     * series, per-question breakdowns (distributions for scale kinds,
     * option counts for choice kinds, latest texts for free-form), and
     * channel + device splits.
     */
    public function formAnalytics(Request $request, int $id): JsonResponse
    {
        $form = ReviewForm::with('questions')->findOrFail($id);
        $days = max(7, min(90, (int) $request->get('days', 30)));
        $since = now()->subDays($days)->startOfDay();

        $stats = ReviewFormStat::where('form_id', $form->id)
            ->where('date', '>=', $since->toDateString())
            ->orderBy('date')
            ->get(['date', 'views', 'submissions']);

        $views = (int) $stats->sum('views');
        $submissionsInWindow = (int) $stats->sum('submissions');

        // Bounded aggregation set — enough for accurate distributions
        // without loading an unbounded table.
        $subs = ReviewSubmission::where('form_id', $form->id)
            ->where('created_at', '>=', $since)
            ->orderByDesc('id')
            ->limit(2000)
            ->get(['id', 'overall_rating', 'nps_score', 'answers', 'comment', 'channel', 'device_id', 'created_at']);

        $ratings = $subs->pluck('overall_rating')->filter(fn ($v) => $v !== null);
        $npsScores = $subs->pluck('nps_score')->filter(fn ($v) => $v !== null);

        $nps = null;
        if ($npsScores->count() > 0) {
            $promoters  = $npsScores->filter(fn ($v) => $v >= 9)->count();
            $detractors = $npsScores->filter(fn ($v) => $v <= 6)->count();
            $nps = (int) round((($promoters - $detractors) / $npsScores->count()) * 100);
        }

        // Per-question breakdowns from the answers json ({question_id: value}).
        $perQuestion = $form->questions->map(function ($q) use ($subs) {
            $values = $subs->map(fn ($s) => $s->answers[(string) $q->id] ?? $s->answers[$q->id] ?? null)
                ->filter(fn ($v) => $v !== null && $v !== '' && $v !== []);

            $row = [
                'id'       => $q->id,
                'label'    => $q->label,
                'kind'     => $q->kind,
                'answered' => $values->count(),
            ];

            if (in_array($q->kind, ['stars', 'scale', 'emoji', 'nps'], true)) {
                $nums = $values->map(fn ($v) => (float) $v)->filter(fn ($v) => is_finite($v));
                $dist = [];
                foreach ($nums as $v) {
                    $k = (string) (int) $v;
                    $dist[$k] = ($dist[$k] ?? 0) + 1;
                }
                ksort($dist, SORT_NUMERIC);
                $row['average'] = $nums->count() ? round($nums->avg(), 2) : null;
                $row['distribution'] = $dist;
            } elseif (in_array($q->kind, ['single_choice', 'multi_choice', 'boolean'], true)) {
                $dist = [];
                foreach ($values as $v) {
                    foreach ((array) $v as $opt) {
                        $k = (string) $opt;
                        $dist[$k] = ($dist[$k] ?? 0) + 1;
                    }
                }
                arsort($dist);
                $row['distribution'] = $dist;
            } else {
                $row['latest'] = $values->take(10)->map(fn ($v) => (string) $v)->values();
            }

            return $row;
        })->values();

        $channels = $subs->groupBy(fn ($s) => $s->channel ?? 'link')
            ->map(fn ($g) => $g->count());

        $deviceCounts = $subs->whereNotNull('device_id')->groupBy('device_id')->map->count();
        $deviceNames = ReviewDevice::whereIn('id', $deviceCounts->keys())->pluck('name', 'id');
        $devices = $deviceCounts->map(fn ($count, $deviceId) => [
            'name'  => $deviceNames[$deviceId] ?? "Device #{$deviceId}",
            'count' => $count,
        ])->values();

        return response()->json([
            'days'   => $days,
            'totals' => [
                'views'           => $views,
                'submissions'     => $submissionsInWindow,
                'completion_rate' => $views > 0 ? round($submissionsInWindow / $views * 100) : null,
                'avg_rating'      => $ratings->count() ? round($ratings->avg(), 2) : null,
                'nps'             => $nps,
            ],
            'series'       => $stats->map(fn ($s) => [
                'date'        => $s->date->toDateString(),
                'views'       => (int) $s->views,
                'submissions' => (int) $s->submissions,
            ])->values(),
            'per_question' => $perQuestion,
            'channels'     => $channels,
            'devices'      => $devices,
        ]);
    }

    /**
     * POST /v1/admin/reviews/forms/{id}/duplicate — clone a survey with
     * its questions (fresh embed key, inactive until published).
     */
    public function duplicateForm(int $id): JsonResponse
    {
        $form = ReviewForm::with('questions')->findOrFail($id);

        $copy = ReviewForm::create([
            'organization_id' => $form->organization_id,
            'name'            => $form->name . ' (copy)',
            'type'            => $form->type,
            'is_active'       => false,
            'is_default'      => false,
            'config'          => $form->config,
            'embed_key'       => Str::random(32),
        ]);

        foreach ($form->questions as $q) {
            ReviewFormQuestion::create([
                'organization_id'    => $form->organization_id,
                'form_id'            => $copy->id,
                'order'              => $q->order,
                'kind'               => $q->kind,
                'label'              => $q->label,
                'help_text'          => $q->help_text,
                'options'            => $q->options,
                'required'           => $q->required,
                'weight'             => $q->weight,
                'condition_index'    => $q->condition_index,
                'condition_operator' => $q->condition_operator,
                'condition_value'    => $q->condition_value,
            ]);
        }

        return response()->json(['form' => $copy->load('questions')], 201);
    }
}
