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
     * POST /v1/admin/email-templates/{template}/send
     *
     * Quick-send a rendered template to a single recipient. Used from the
     * customer + inquiry detail pages — staff can pick a template and fire
     * it off in two clicks without leaving the page.
     *
     * Body:
     *   - to:        required email
     *   - member_id: optional — when present the template's merge tags
     *                substitute against that member's data
     *   - subject:   optional override (defaults to rendered subject)
     */
    public function sendOnce(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'to'         => 'required|email|max:191',
            'member_id'  => 'nullable|integer|exists:loyalty_members,id',
            'subject'    => 'nullable|string|max:255',
        ]);

        $template = EmailTemplate::findOrFail($id);

        // Resolve a member to render against — falls back to any active
        // member so the template's merge tags don't render as literal {{name}}
        // when the caller is sending to a CRM contact who isn't a member.
        $member = !empty($data['member_id'])
            ? LoyaltyMember::find($data['member_id'])
            : null;
        if (!$member) {
            $member = LoyaltyMember::where('is_active', true)->first();
        }
        if (!$member) {
            // No members at all in this org — still allow a raw send by passing
            // an empty render context. The template will ship with merge tags
            // unsubstituted, which is preferable to silently 422'ing the staff.
            $rendered = [
                'subject' => $data['subject'] ?? $template->subject,
                'html'    => $template->html_body,
            ];
        } else {
            $rendered = $template->render($member);
            if (!empty($data['subject'])) {
                $rendered['subject'] = $data['subject'];
            }
        }

        try {
            \Illuminate\Support\Facades\Mail::send([], [], function ($message) use ($data, $rendered) {
                $message->to($data['to'])
                    ->subject($rendered['subject'])
                    ->html($rendered['html']);
            });
        } catch (\Throwable $e) {
            \Log::error('EmailTemplate quick-send failed', [
                'template_id' => $id,
                'to'          => $data['to'],
                'error'       => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Send failed: ' . $e->getMessage(),
            ], 500);
        }

        // Audit trail so we can see who sent what to whom.
        try {
            \App\Models\AuditLog::create([
                'organization_id' => $request->user()?->organization_id,
                'user_id'         => $request->user()?->id,
                'action'          => 'email_template.sent',
                'description'     => "Sent template '{$template->name}' to {$data['to']}",
                'subject_type'    => EmailTemplate::class,
                'subject_id'      => $template->id,
                'new_values'      => [
                    'to'      => $data['to'],
                    'subject' => $rendered['subject'],
                ],
            ]);
        } catch (\Throwable) {
            // Audit-log failure must never break the send.
        }

        return response()->json([
            'message' => 'Email sent.',
            'to'      => $data['to'],
            'subject' => $rendered['subject'],
        ]);
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
