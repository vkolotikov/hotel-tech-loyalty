<?php

namespace App\Http\Controllers\Api\V1\Public;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LeadForm;
use App\Models\LeadFormSubmission;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Services\CustomFieldService;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public (no auth) endpoints for the lead-capture form widget.
 *
 *   GET  /v1/public/lead-forms/{embedKey}        — config + fields
 *   POST /v1/public/lead-forms/{embedKey}/submit — create lead
 *
 * The form's embed_key gates access. We look up the LeadForm with
 * `withoutGlobalScopes` (no auth = no tenant context bound), bind the
 * org from the form's organization_id, then proceed inside the
 * tenant-scoped world.
 */
class LeadFormPublicController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
        protected CustomFieldService $customFields,
    ) {}

    /**
     * Public config fetch — used by the JS widget to render. The Blade
     * view doesn't call this (it gets the form server-side), but the
     * endpoint stays for future JS-popup embeds + diagnostics.
     */
    public function show(string $embedKey): JsonResponse
    {
        $form = $this->resolveForm($embedKey);
        if (!$form) {
            return response()->json(['message' => 'Form not found.'], 404);
        }
        if (!$form->is_active) {
            return response()->json(['message' => 'This form is no longer accepting submissions.'], 410);
        }

        return response()->json([
            'name'        => $form->name,
            'embed_key'   => $form->embed_key,
            'fields'      => $form->fields ?: LeadForm::defaultFields(),
            'design'      => $form->design ?: LeadForm::defaultDesign(),
        ]);
    }

    /**
     * Process a form submission. Always returns 200 with a friendly
     * payload for happy-path; validation failures come back 422 with
     * field-keyed errors. Spam / rate-limit gates ride on Laravel's
     * route throttle (configured in routes/api.php).
     */
    public function submit(Request $request, string $embedKey): JsonResponse
    {
        $form = $this->resolveForm($embedKey);
        if (!$form) {
            return response()->json(['message' => 'Form not found.'], 404);
        }
        if (!$form->is_active) {
            return response()->json(['message' => 'This form is no longer accepting submissions.'], 410);
        }

        // Build dynamic validation rules from the form's field config.
        $rules = $this->buildValidationRules($form);
        $validated = $request->validate($rules);

        // Persist the raw submission first so we have a debug trail
        // even if the downstream Guest/Inquiry creation fails.
        $submission = LeadFormSubmission::create([
            'lead_form_id' => $form->id,
            'payload'      => $request->except(['_token', 'password']),
            'ip'           => $request->ip(),
            'user_agent'   => substr((string) $request->userAgent(), 0, 1000),
            'referrer'     => substr((string) $request->headers->get('referer', ''), 0, 1000),
            'status'       => 'processed',
        ]);

        try {
            [$guest, $inquiry] = $this->createGuestAndInquiry($form, $validated);

            $submission->forceFill([
                'guest_id'   => $guest?->id,
                'inquiry_id' => $inquiry?->id,
            ])->save();

            $form->increment('submission_count');
            $form->forceFill(['last_submitted_at' => now()])->save();

            // Fire a realtime "hot lead" so any open admin tabs see the
            // toast + browser notification immediately.
            if ($inquiry && $guest) {
                $this->realtime->dispatch('hot_lead', 'New lead', "{$guest->full_name} via {$form->name}", [
                    'inquiry_id'   => $inquiry->id,
                    'guest_name'   => $guest->full_name,
                    'lead_form_id' => $form->id,
                    'source'       => $form->default_source ?: 'website_form',
                ]);
            }
        } catch (\Throwable $e) {
            $submission->forceFill([
                'status'        => 'error',
                'error_message' => substr($e->getMessage(), 0, 500),
            ])->save();
            \Log::error('LeadForm submit failed: ' . $e->getMessage(), [
                'lead_form_id' => $form->id,
                'embed_key'    => $form->embed_key,
            ]);
            return response()->json([
                'message' => 'Could not save your submission. Please try again or contact us directly.',
            ], 500);
        }

        $design = $form->design ?: LeadForm::defaultDesign();
        return response()->json([
            'success'         => true,
            'success_title'   => $design['success_title']   ?? 'Thanks!',
            'success_message' => $design['success_message'] ?? "We've got your details and will be in touch soon.",
        ]);
    }

    /* ─── helpers ─────────────────────────────────────────────── */

    /**
     * Look up the form across tenants (no auth context) + bind its
     * org to the container so subsequent tenant-scoped writes go to
     * the right place.
     */
    private function resolveForm(string $embedKey): ?LeadForm
    {
        $form = LeadForm::withoutGlobalScopes()
            ->where('embed_key', $embedKey)
            ->first();
        if (!$form) return null;

        if (!app()->bound('current_organization_id')) {
            app()->instance('current_organization_id', $form->organization_id);
        }
        if ($form->brand_id && !app()->bound('current_brand_id')) {
            app()->instance('current_brand_id', $form->brand_id);
        }

        return $form;
    }

    /**
     * Compose Laravel validation rules from the form's enabled fields.
     * Built-in keys map to their natural rule (email → email, phone →
     * string, date → date). Custom fields get a permissive `array`
     * rule then go through CustomFieldService::validate.
     */
    private function buildValidationRules(LeadForm $form): array
    {
        $rules = [];
        foreach (($form->fields ?: []) as $f) {
            if (empty($f['enabled'])) continue;
            $key = (string) ($f['key'] ?? '');
            if ($key === '') continue;

            $required = !empty($f['required']);
            $base     = $required ? 'required' : 'nullable';

            switch ($f['type'] ?? 'text') {
                case 'email':    $rules[$key] = "{$base}|email|max:200";       break;
                case 'phone':    $rules[$key] = "{$base}|string|max:50";       break;
                case 'date':     $rules[$key] = "{$base}|date";                break;
                case 'number':   $rules[$key] = "{$base}|numeric";             break;
                case 'textarea': $rules[$key] = "{$base}|string|max:4000";     break;
                case 'select':   $rules[$key] = "{$base}|string|max:120";      break;
                case 'multiselect':
                                 $rules[$key] = ($required ? 'required' : 'nullable') . '|array';
                                 $rules["{$key}.*"] = 'string|max:120';
                                 break;
                case 'checkbox': $rules[$key] = "{$base}|boolean";             break;
                case 'url':      $rules[$key] = "{$base}|url|max:500";         break;
                case 'text':
                default:         $rules[$key] = "{$base}|string|max:500";      break;
            }
        }
        return $rules;
    }

    /**
     * Map the validated submission onto Guest + Inquiry rows.
     *
     * Guest dedup: find by email, then phone (e.164-ish normalised).
     * Inquiry: defaults from the form, optional check-in/out from the
     * fields, custom fields go into inquiries.custom_data via the
     * CRM's existing custom-field validation pipeline.
     */
    private function createGuestAndInquiry(LeadForm $form, array $data): array
    {
        $name  = trim((string) ($data['name']  ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));

        // Find-or-create the guest. Match by email first (most reliable),
        // then phone. Don't dedupe on name alone — that's too lossy.
        $guest = null;
        if ($email !== '') {
            $guest = Guest::where('email', $email)->first();
        }
        if (!$guest && $phone !== '') {
            $guest = Guest::where('phone', $phone)->first();
        }
        if (!$guest) {
            $guest = Guest::create([
                'full_name' => $name !== '' ? $name : ($email ?: 'Form submission'),
                'email'     => $email ?: null,
                'phone'     => $phone ?: null,
                'lead_source' => $form->default_source ?: 'website_form',
            ]);
        } else {
            // Refresh contact bits if the guest re-submits with new info.
            $patch = array_filter([
                'phone' => $phone ?: null,
            ], fn ($v) => $v !== null);
            if ($patch && empty($guest->phone)) {
                $guest->update($patch);
            }
        }

        // Default to the org's default pipeline + first open stage so the
        // lead lands somewhere visible.
        $pipeline   = Pipeline::where('is_default', true)->first();
        $firstStage = $pipeline
            ? PipelineStage::where('pipeline_id', $pipeline->id)
                ->where('kind', 'open')
                ->orderBy('sort_order')
                ->first()
            : null;

        // Custom fields posted on the form go through the standard CRM
        // validator so options + types stay consistent with admin-defined
        // rules. Keys are stored on inquiries.custom_data.
        $customData = [];
        foreach (($form->fields ?: []) as $f) {
            $key = (string) ($f['key'] ?? '');
            if (str_starts_with($key, 'custom:') && array_key_exists($key, $data)) {
                $customData[substr($key, 7)] = $data[$key];
            }
        }
        $cleanCustom = !empty($customData)
            ? $this->customFields->validate('inquiry', $customData)
            : null;

        // Build the inquiry. Stage / status fall back to the legacy
        // 'New' string when no pipeline exists yet.
        $inquiryData = [
            'guest_id'         => $guest->id,
            'lead_form_id'     => $form->id,
            'source'           => $form->default_source ?: 'website_form',
            'status'           => $firstStage?->name ?: 'New',
            'priority'         => 'Medium',
            'pipeline_id'      => $pipeline?->id,
            'pipeline_stage_id'=> $firstStage?->id,
            // inquiry_type is NOT NULL on the table, so fall back to
            // 'General' when neither the form's default nor the
            // submitted value is set. Admins re-classify from the
            // lead detail page.
            'inquiry_type'     => $form->default_inquiry_type
                ?: ($data['inquiry_type'] ?? null)
                ?: 'General',
            'property_id'      => $form->default_property_id,
            'assigned_to'      => $form->default_assigned_to,
            'check_in'         => $data['check_in']   ?? null,
            'check_out'        => $data['check_out']  ?? null,
            'num_adults'       => isset($data['num_people']) ? (int) $data['num_people'] : null,
            'special_requests' => $data['message']   ?? null,
            'custom_data'      => $cleanCustom,
        ];

        if (!empty($inquiryData['check_in']) && !empty($inquiryData['check_out'])) {
            $inquiryData['num_nights'] = (int) date_diff(
                date_create($inquiryData['check_in']),
                date_create($inquiryData['check_out']),
            )->days;
        }

        // Strip nulls so any NOT-NULL-with-default columns on the
        // inquiries table (num_adults, num_children, etc.) fall back to
        // their DB defaults instead of choking on an explicit null.
        $inquiryData = array_filter(
            $inquiryData,
            fn ($v) => $v !== null,
        );

        $inquiry = Inquiry::create($inquiryData);

        return [$guest, $inquiry];
    }
}
