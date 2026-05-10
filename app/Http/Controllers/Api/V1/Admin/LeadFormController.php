<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LeadForm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin endpoints for the embeddable lead-capture forms.
 *
 * The public-facing widget/submit flow lives in
 * Public\LeadFormPublicController. This controller is staff-only:
 * create, list, edit, regenerate-key, view submissions.
 */
class LeadFormController extends Controller
{
    public function index(): JsonResponse
    {
        $forms = LeadForm::orderByDesc('updated_at')->get([
            'id', 'name', 'embed_key', 'description',
            'is_active', 'submission_count', 'last_submitted_at',
            'design', 'updated_at',
        ]);
        return response()->json($forms);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:120',
            'description' => 'nullable|string|max:500',
        ]);

        $form = LeadForm::create([
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'embed_key'   => LeadForm::newEmbedKey(),
            'fields'      => LeadForm::defaultFields(),
            'design'      => LeadForm::defaultDesign(),
            'is_active'   => true,
        ]);

        return response()->json($form, 201);
    }

    public function show(int $leadForm): JsonResponse
    {
        $form = $this->resolveForm($leadForm);
        return response()->json($form);
    }

    public function update(Request $request, int $leadForm): JsonResponse
    {
        $form = $this->resolveForm($leadForm);

        $data = $request->validate([
            'name'                  => 'sometimes|string|max:120',
            'description'           => 'sometimes|nullable|string|max:500',
            'default_source'        => 'sometimes|nullable|string|max:100',
            'default_inquiry_type'  => 'sometimes|nullable|string|max:50',
            'default_property_id'   => 'sometimes|nullable|integer|exists:properties,id',
            'default_assigned_to'   => 'sometimes|nullable|string|max:150',
            'fields'                => 'sometimes|array',
            'design'                => 'sometimes|array',
            'is_active'             => 'sometimes|boolean',
        ]);

        $form->fill($data)->save();
        return response()->json($form->fresh());
    }

    public function destroy(int $leadForm): JsonResponse
    {
        $form = $this->resolveForm($leadForm);
        $form->delete();
        return response()->json(['success' => true]);
    }

    /**
     * Mint a new embed_key. Existing iframes will break — that's the
     * point: this is the "lock out" lever when a form is being spammed.
     */
    public function regenerateKey(int $leadForm): JsonResponse
    {
        $form = $this->resolveForm($leadForm);
        $form->forceFill(['embed_key' => LeadForm::newEmbedKey()])->save();
        return response()->json(['embed_key' => $form->embed_key]);
    }

    /**
     * GET /v1/admin/lead-forms/{form}/submissions — paginated list of
     * raw submissions for the inspect modal. Limited to recent ones.
     */
    public function submissions(int $leadForm): JsonResponse
    {
        $form = $this->resolveForm($leadForm);
        $rows = $form->submissions()
            ->with(['guest:id,full_name,email,phone', 'inquiry:id,status,total_value'])
            ->latest()
            ->paginate(25);
        return response()->json($rows);
    }

    /**
     * Explicit lookup instead of Laravel's implicit route model binding.
     * Hit a Phase 10 deploy bug on production where implicit binding
     * 404'd despite the row existing in the right org — explicit lookup
     * with a clear failure path keeps the failure mode obvious.
     *
     * @throws \Symfony\Component\HttpKernel\Exception\NotFoundHttpException
     */
    private function resolveForm(int $id): LeadForm
    {
        $form = LeadForm::find($id);
        if (!$form) {
            // Belt-and-braces: surface the cross-tenant case clearly so
            // future debugging doesn't bounce around looking at routes.
            $existsInOtherOrg = LeadForm::withoutGlobalScopes()->where('id', $id)->exists();
            abort(404, $existsInOtherOrg
                ? 'Lead form belongs to a different organization.'
                : 'Lead form not found.');
        }
        return $form;
    }
}
