<?php

namespace App\Http\Controllers\Api\V1\Integrations;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Public lead-intake endpoint for external systems pushing leads into the
 * CRM via a Sanctum personal access token.
 *
 * Originally built for the FDS Card Builder ↔ Hotel Tech CRM integration
 * but the contract is fully generic — set `external_source` to whatever
 * tag identifies the calling system (e.g. "fds_card_builder", "typeform",
 * "stripe_invoice") and the same endpoint handles it.
 *
 * Idempotency: the unique tuple (organization_id, external_source,
 * external_id) is enforced by a partial unique index and by a pre-create
 * SELECT inside a serialised transaction. Two POSTs with the same payload
 * return the same Lead — the second one as 200, the first as 201 — so
 * the caller can retry safely on network failure.
 *
 * Multi-tenancy: the Sanctum token authenticates a User; that user's
 * organization_id binds current_organization_id; all Eloquent writes are
 * auto-scoped via the BelongsToOrganization global scope. A token from
 * one org can never push a lead into another org's data.
 */
class LeadIntakeController extends Controller
{
    /**
     * POST /v1/integrations/leads
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'external_source'    => 'required|string|max:50',
            // Optional: your own unique id per submission enables safe retries
            // (same id → same lead). Omit it and each POST creates a new lead.
            'external_id'        => 'nullable|string|max:255',
            'external_url'       => 'nullable|url|max:2048',
            'submitted_at'       => 'nullable|date',
            // Optional: route the lead to a specific brand. Validated below to
            // belong to the token's organization. Omit → org's default brand.
            'brand_id'           => 'nullable|integer',
            'contact'            => 'required|array',
            'contact.name'       => 'required|string|max:255',
            'contact.email'      => 'required|email|max:255',
            'contact.phone'      => 'nullable|string|max:255',
            'contact.company'    => 'nullable|string|max:255',
            'contact.position'   => 'nullable|string|max:255',
            // Optional — plain signup forms have no order value.
            'amount'             => 'nullable|numeric|min:0',
            'currency'           => 'nullable|string|size:3',
            'description'        => 'nullable|string',
        ]);

        $user = $request->user();
        if (!$user || !$user->organization_id) {
            // Shouldn't happen — auth:sanctum guarantees a user, and
            // staff always have an org. Defensive guard so a misconfigured
            // token (member user, no org pin) gets a clean error rather
            // than a global-scope-fail silent zero-row insert.
            return response()->json([
                'error' => 'Authenticated user has no organization assigned',
            ], 403);
        }

        $orgId = $user->organization_id;
        $source = $validated['external_source'];
        // Generate a fallback id when the caller doesn't supply one, so the
        // (org, source, external_id) unique index stays populated.
        $externalId = ($validated['external_id'] ?? null) ?: (string) Str::uuid();

        // Security: a brand_id must belong to the token owner's organization —
        // never let a token push a lead into another org's brand.
        $brandId = $validated['brand_id'] ?? null;
        if ($brandId !== null) {
            $ownsBrand = Brand::withoutGlobalScopes()
                ->where('id', $brandId)
                ->where('organization_id', $orgId)
                ->whereNull('deleted_at')
                ->exists();
            if (!$ownsBrand) {
                return response()->json([
                    'error' => 'brand_id does not belong to your organization',
                ], 422);
            }
        }

        // Pre-check: existing lead with same external attribution returns 200.
        // This is the safe path 99% of the time — retries hit here.
        $existing = Inquiry::where('external_source', $source)
            ->where('external_id', $externalId)
            ->first();
        if ($existing) {
            return response()->json([
                'id'  => $existing->id,
                'url' => $this->adminUrl($existing),
            ], 200);
        }

        try {
            $inquiry = DB::transaction(function () use ($validated, $orgId, $brandId, $externalId) {
                $guest = $this->upsertGuest($validated['contact'], $orgId);

                // Default pipeline + first open stage so the lead is visible
                // in /inquiries without any further admin action.
                $pipeline   = Pipeline::where('is_default', true)->first();
                $firstStage = $pipeline
                    ? PipelineStage::where('pipeline_id', $pipeline->id)
                        ->where('kind', 'open')
                        ->orderBy('sort_order')
                        ->first()
                    : null;

                return Inquiry::create([
                    'guest_id'              => $guest->id,
                    // Explicit brand_id wins over BelongsToBrand's auto-fill;
                    // when null it falls back to the org's default brand.
                    'brand_id'              => $brandId,
                    'source'                => $validated['external_source'],
                    'status'                => $firstStage?->name ?: 'New',
                    'priority'              => 'Medium',
                    'pipeline_id'           => $pipeline?->id,
                    'pipeline_stage_id'     => $firstStage?->id,
                    // inquiry_type is NOT NULL on the table — fall back to General.
                    'inquiry_type'          => 'General',
                    'total_value'           => $validated['amount'] ?? 0,
                    'currency'              => strtoupper($validated['currency'] ?? 'EUR'),
                    'notes'                 => $validated['description'] ?? null,
                    'external_source'       => $validated['external_source'],
                    'external_id'           => $externalId,
                    'external_url'          => $validated['external_url']   ?? null,
                    'external_submitted_at' => $validated['submitted_at'] ?? now(),
                ]);
            });
        } catch (QueryException $e) {
            // 23505 = Postgres unique_violation. The partial unique index on
            // (organization_id, external_source, external_id) caught a race
            // between our pre-check and the INSERT. Re-fetch and return 200.
            if ($e->getCode() === '23505') {
                $existing = Inquiry::where('external_source', $source)
                    ->where('external_id', $externalId)
                    ->first();
                if ($existing) {
                    return response()->json([
                        'id'  => $existing->id,
                        'url' => $this->adminUrl($existing),
                    ], 200);
                }
            }
            throw $e;
        }

        return response()->json([
            'id'  => $inquiry->id,
            'url' => $this->adminUrl($inquiry),
        ], 201);
    }

    /**
     * Find an existing guest in the org by email; otherwise create one.
     * Phone is upserted onto an existing guest only when blank — never
     * overwrite real CRM data with whatever the external system has.
     */
    private function upsertGuest(array $contact, int $orgId): Guest
    {
        $email = strtolower(trim($contact['email']));
        $name  = trim($contact['name']);

        $guest = Guest::where('email', $email)->first();

        if (!$guest) {
            // Split the name lazily — full_name is the primary display field
            // throughout the CRM, but first_name / last_name are useful for
            // segmentation and personalisation.
            [$first, $last] = $this->splitName($name);
            $guest = Guest::create([
                'full_name'      => $name ?: $email,
                'first_name'     => $first,
                'last_name'      => $last,
                'email'          => $email,
                'phone'          => $contact['phone']    ?? null,
                'company'        => $contact['company']  ?? null,
                'position_title' => $contact['position'] ?? null,
                'lead_source'    => 'api_integration',
            ]);
        } else {
            // Backfill missing fields only — never clobber.
            $patch = array_filter([
                'phone'          => $contact['phone']    ?? null,
                'company'        => $contact['company']  ?? null,
                'position_title' => $contact['position'] ?? null,
            ], fn ($v) => $v !== null && $v !== '');

            $patch = array_filter($patch, fn ($v, $k) => empty($guest->{$k}), ARRAY_FILTER_USE_BOTH);

            if (!empty($patch)) {
                $guest->update($patch);
            }
        }

        return $guest;
    }

    private function splitName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), 2);
        return [$parts[0] ?? null, $parts[1] ?? null];
    }

    /**
     * Build the admin deep-link the caller can click to inspect the lead.
     */
    private function adminUrl(Inquiry $inquiry): string
    {
        $base = rtrim((string) config('app.url'), '/');
        if ($base === '') {
            $base = 'https://loyalty.hotel-tech.ai';
        }
        return "{$base}/inquiries/{$inquiry->id}";
    }
}
