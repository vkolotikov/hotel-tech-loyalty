<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use Illuminate\Http\JsonResponse;
use App\Services\Booking\Setup\OwnRows;
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

        // No member to fill the tags (a venue on HexaTech CRM alone has none; 2026-11-12): the template as a lead or a
        // contact receives it, the member's tags left empty — never a 404 that leaves the editor with no preview.
        if (!$member) {
            $rendered = $template->renderWithoutMember();

            return response()->json(['subject' => $rendered['subject'], 'html' => $rendered['html'], 'member' => null]);
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
            'member_id'  => ['nullable', 'integer', OwnRows::rule('loyalty_members')],
            'subject'    => 'nullable|string|max:255',
        ]);

        $template = EmailTemplate::findOrFail($id);

        // The member it is for, when there is one. Without one the member's tags are left empty (2026-11-08): before,
        // the first active member's name, email, card number, points and referral code went to whoever `to` was.
        $member = !empty($data['member_id'])
            ? LoyaltyMember::find($data['member_id'])
            : null;
        $rendered = $member ? $template->render($member) : $template->renderWithoutMember();
        if (!empty($data['subject'])) {
            $rendered['subject'] = $data['subject'];
        }

        try {
            \Illuminate\Support\Facades\Mail::send([], [], function ($message) use ($data, $rendered) {
                $message->to($data['to'])
                    ->subject($rendered['subject'])
                    ->html($rendered['html']);
                // The venue's name on the envelope and its reply-to (2026-11-12): before, a template went out as the
                // platform's MAIL_FROM with no reply-to, so a lead's answer reached an unread noreply mailbox. The
                // address stays the platform's (MailIdentityService); the CRM's Integrations shows the same identity.
                app(\App\Services\MailIdentityService::class)->apply($message);
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
