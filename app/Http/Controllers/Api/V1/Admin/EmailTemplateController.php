<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        $templates = EmailTemplate::orderByDesc('updated_at')->get();

        return response()->json(['templates' => $templates]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'      => 'required|string|max:255',
            'subject'   => 'required|string|max:255',
            'html_body' => 'required|string',
            'category'  => 'nullable|in:campaign,transactional,welcome',
        ]);

        $template = EmailTemplate::create([
            ...$validated,
            'merge_tags' => $this->extractTags($validated['html_body'], $validated['subject']),
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Template created', 'template' => $template], 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json([
            'template'       => EmailTemplate::findOrFail($id),
            'available_tags' => EmailTemplate::AVAILABLE_TAGS,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $template = EmailTemplate::findOrFail($id);

        $validated = $request->validate([
            'name'      => 'sometimes|string|max:255',
            'subject'   => 'sometimes|string|max:255',
            'html_body' => 'sometimes|string',
            'category'  => 'nullable|in:campaign,transactional,welcome',
            'is_active' => 'sometimes|boolean',
        ]);

        $template->update($validated);

        // Re-extract merge tags if content changed
        if (isset($validated['html_body']) || isset($validated['subject'])) {
            $template->update([
                'merge_tags' => $this->extractTags(
                    $template->html_body,
                    $template->subject,
                ),
            ]);
        }

        return response()->json(['message' => 'Template updated', 'template' => $template->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        EmailTemplate::findOrFail($id)->delete();

        return response()->json(['message' => 'Template deleted']);
    }

    /**
     * Preview a template rendered with a sample member's data.
     */
    public function preview(Request $request, int $id): JsonResponse
    {
        $template = EmailTemplate::findOrFail($id);

        // Use a specific member or grab the first active one for preview
        $memberId = $request->get('member_id');
        $member = $memberId
            ? LoyaltyMember::findOrFail($memberId)
            : LoyaltyMember::where('is_active', true)->first();

        if (!$member) {
            return response()->json(['message' => 'No member found for preview'], 404);
        }

        $rendered = $template->render($member);

        return response()->json([
            'subject' => $rendered['subject'],
            'html'    => $rendered['html'],
            'member'  => $member->user->name ?? 'Preview Member',
        ]);
    }

    /**
     * Return available merge tags with descriptions.
     */
    public function mergeTags(): JsonResponse
    {
        return response()->json(['tags' => EmailTemplate::AVAILABLE_TAGS]);
    }

    /**
     * Extract {{tag}} patterns found in subject + body.
     */
    private function extractTags(string $body, string $subject): array
    {
        $combined = $subject . ' ' . $body;
        preg_match_all('/\{\{[a-z_]+\}\}/', $combined, $matches);

        return array_values(array_unique($matches[0] ?? []));
    }
}
