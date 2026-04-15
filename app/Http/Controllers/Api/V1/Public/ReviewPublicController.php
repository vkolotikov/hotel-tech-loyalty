<?php

namespace App\Http\Controllers\Api\V1\Public;

use App\Http\Controllers\Controller;
use App\Models\ReviewForm;
use App\Models\ReviewIntegration;
use App\Models\ReviewInvitation;
use App\Models\ReviewSubmission;
use App\Scopes\TenantScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewPublicController extends Controller
{
    /**
     * GET /api/v1/public/reviews/token/{token}
     * Resolve a tokenized invitation, mark it opened, return the form
     * plus any pre-filled identity so the public page can skip name/email.
     */
    public function byToken(string $token): JsonResponse
    {
        $invitation = ReviewInvitation::withoutGlobalScope(TenantScope::class)
            ->with(['form.questions', 'guest', 'member.user', 'member.tier'])
            ->where('token', $token)
            ->first();

        if (!$invitation) {
            return response()->json(['message' => 'Invitation not found'], 404);
        }

        if ($invitation->expires_at && $invitation->expires_at->isPast()) {
            return response()->json(['message' => 'Invitation expired', 'status' => 'expired'], 410);
        }

        if (in_array($invitation->status, ['submitted', 'redirected'])) {
            return response()->json([
                'message'      => 'Already submitted',
                'status'       => 'submitted',
                'form'         => $this->formPayload($invitation->form),
            ], 200);
        }

        if ($invitation->status === 'pending') {
            $invitation->forceFill([
                'status'    => 'opened',
                'opened_at' => now(),
            ])->save();
        }

        return response()->json([
            'status'      => $invitation->status,
            'invitation'  => [
                'id'       => $invitation->id,
                'channel'  => $invitation->channel,
                'prefill'  => $this->prefillFromInvitation($invitation),
            ],
            'form'        => $this->formPayload($invitation->form),
            'integrations' => $this->enabledIntegrations($invitation->organization_id),
        ]);
    }

    /**
     * GET /api/v1/public/reviews/form/{id}?key=...
     * Anonymous/embed access via form id + embed_key pair.
     */
    public function byFormKey(int $id, Request $request): JsonResponse
    {
        $key = $request->query('key');
        if (!$key) {
            return response()->json(['message' => 'Embed key required'], 403);
        }

        $form = ReviewForm::withoutGlobalScope(TenantScope::class)
            ->with('questions')
            ->where('id', $id)
            ->where('embed_key', $key)
            ->where('is_active', true)
            ->first();

        if (!$form) {
            return response()->json(['message' => 'Form not found or inactive'], 404);
        }

        if (!($form->config['allow_anonymous'] ?? true)) {
            return response()->json(['message' => 'Anonymous submissions disabled'], 403);
        }

        return response()->json([
            'status'        => 'open',
            'form'          => $this->formPayload($form),
            'integrations'  => $this->enabledIntegrations($form->organization_id),
        ]);
    }

    /**
     * POST /api/v1/public/reviews/token/{token}
     */
    public function submitByToken(string $token, Request $request): JsonResponse
    {
        $invitation = ReviewInvitation::withoutGlobalScope(TenantScope::class)
            ->with('form.questions')
            ->where('token', $token)
            ->first();

        if (!$invitation) {
            return response()->json(['message' => 'Invitation not found'], 404);
        }

        if (in_array($invitation->status, ['submitted', 'redirected'])) {
            return response()->json(['message' => 'Already submitted'], 409);
        }

        $data = $this->validateSubmission($request, $invitation->form);

        $submission = $this->recordSubmission(
            form: $invitation->form,
            orgId: $invitation->organization_id,
            invitation: $invitation,
            data: $data,
            request: $request,
        );

        $invitation->forceFill([
            'status'       => 'submitted',
            'submitted_at' => now(),
        ])->save();

        return response()->json($this->buildSubmitResponse($submission, $invitation->form));
    }

    /**
     * POST /api/v1/public/reviews/form/{id}?key=...
     */
    public function submitByFormKey(int $id, Request $request): JsonResponse
    {
        $key = $request->query('key');

        $form = ReviewForm::withoutGlobalScope(TenantScope::class)
            ->with('questions')
            ->where('id', $id)
            ->where('embed_key', $key)
            ->where('is_active', true)
            ->first();

        if (!$form) {
            return response()->json(['message' => 'Form not found'], 404);
        }

        if (!($form->config['allow_anonymous'] ?? true)) {
            return response()->json(['message' => 'Anonymous submissions disabled'], 403);
        }

        $data = $this->validateSubmission($request, $form);

        $submission = $this->recordSubmission(
            form: $form,
            orgId: $form->organization_id,
            invitation: null,
            data: $data,
            request: $request,
        );

        return response()->json($this->buildSubmitResponse($submission, $form));
    }

    /**
     * POST /api/v1/public/reviews/{submissionId}/redirected
     * Beacon-style call from the public page when the user clicks
     * through to an external platform, so we can count conversions.
     */
    public function markRedirected(int $submissionId, Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform' => 'required|string|max:30',
        ]);

        $sub = ReviewSubmission::withoutGlobalScope(TenantScope::class)->find($submissionId);
        if (!$sub) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $sub->forceFill([
            'redirected_externally' => true,
            'external_platform'     => $data['platform'],
        ])->save();

        if ($sub->invitation_id) {
            ReviewInvitation::withoutGlobalScope(TenantScope::class)
                ->where('id', $sub->invitation_id)
                ->update(['status' => 'redirected']);
        }

        return response()->json(['ok' => true]);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private function validateSubmission(Request $request, ReviewForm $form): array
    {
        return $request->validate([
            'overall_rating'  => 'nullable|integer|min:1|max:5',
            'nps_score'       => 'nullable|integer|min:0|max:10',
            'comment'         => 'nullable|string|max:5000',
            'answers'         => 'nullable|array',
            'anonymous_name'  => 'nullable|string|max:255',
            'anonymous_email' => 'nullable|email|max:255',
        ]);
    }

    private function recordSubmission(
        ReviewForm $form,
        int $orgId,
        ?ReviewInvitation $invitation,
        array $data,
        Request $request,
    ): ReviewSubmission {
        // Bind tenant context so BelongsToOrganization fills org id.
        app()->instance('current_organization_id', $orgId);

        return ReviewSubmission::create([
            'form_id'          => $form->id,
            'invitation_id'    => $invitation?->id,
            'guest_id'         => $invitation?->guest_id,
            'loyalty_member_id'=> $invitation?->loyalty_member_id,
            'overall_rating'   => $data['overall_rating']  ?? null,
            'nps_score'        => $data['nps_score']       ?? null,
            'comment'          => $data['comment']         ?? null,
            'answers'          => $data['answers']         ?? null,
            'anonymous_name'   => $invitation ? null : ($data['anonymous_name']  ?? null),
            'anonymous_email'  => $invitation ? null : ($data['anonymous_email'] ?? null),
            'ip'               => $request->ip(),
            'user_agent'       => substr((string) $request->userAgent(), 0, 512),
            'submitted_at'     => now(),
        ]);
    }

    /**
     * Build the post-submit response. For basic forms where the rating
     * meets the redirect threshold, include every enabled integration so
     * the frontend can show a "share this on Google / Trustpilot / ..."
     * prompt. For ratings below the threshold, stay silent — we keep
     * the feedback internal so the guest can't be nudged into posting
     * a negative public review.
     */
    private function buildSubmitResponse(ReviewSubmission $submission, ReviewForm $form): array
    {
        $response = [
            'ok'             => true,
            'submission_id'  => $submission->id,
            'thank_you_text' => $form->config['thank_you_text'] ?? 'Thank you for your feedback.',
            'redirect'       => null,
        ];

        if ($form->type !== 'basic' || !$submission->overall_rating) {
            return $response;
        }

        $threshold = (int) ($form->config['redirect_threshold'] ?? 4);
        if ($threshold <= 0 || $submission->overall_rating < $threshold) {
            return $response;
        }

        $integrations = $this->enabledIntegrations($form->organization_id);
        if (empty($integrations)) {
            return $response;
        }

        $response['redirect'] = [
            'prompt'   => $form->config['redirect_prompt'] ?? 'Would you share this on a review site?',
            'options'  => $integrations,
        ];

        return $response;
    }

    private function enabledIntegrations(int $orgId): array
    {
        return ReviewIntegration::withoutGlobalScope(TenantScope::class)
            ->where('organization_id', $orgId)
            ->where('is_enabled', true)
            ->get()
            ->map(fn($i) => [
                'platform'     => $i->platform,
                'display_name' => $i->display_name ?? ucfirst($i->platform),
                'url'          => $i->write_review_url,
            ])
            ->values()
            ->all();
    }

    private function prefillFromInvitation(ReviewInvitation $inv): array
    {
        if ($inv->member?->user) {
            return [
                'name'  => $inv->member->user->name,
                'email' => $inv->member->user->email,
                'tier'  => $inv->member->tier->name ?? null,
            ];
        }
        if ($inv->guest) {
            return [
                'name'  => $inv->guest->full_name,
                'email' => $inv->guest->email,
            ];
        }
        return [];
    }

    private function formPayload(ReviewForm $form): array
    {
        return [
            'id'         => $form->id,
            'name'       => $form->name,
            'type'       => $form->type,
            'config'     => $form->config ?? [],
            'questions'  => $form->questions->map(fn($q) => [
                'id'                 => $q->id,
                'kind'               => $q->kind,
                'label'              => $q->label,
                'help_text'          => $q->help_text,
                'options'            => $q->options,
                'required'           => (bool) $q->required,
                'condition_index'    => $q->condition_index,
                'condition_operator' => $q->condition_operator,
                'condition_value'    => $q->condition_value,
            ])->values(),
        ];
    }
}
