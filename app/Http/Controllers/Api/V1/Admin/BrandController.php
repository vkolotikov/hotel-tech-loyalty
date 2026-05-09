<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * CRUD for brands inside the current organization.
 *
 * Security model:
 *  - All routes go through tenant + saas.auth middleware so we trust the
 *    organization context to be correct. BelongsToOrganization scope means
 *    a member of org A can never see org B's brands.
 *  - The default brand cannot be deleted; admin must designate a new
 *    default first via setDefault().
 *
 * Phase 1 scope: list, create, update, set-default, delete, upload-logo.
 * Per-brand stats (chat/booking counts) ship in Phase 4 once those tables
 * are brand-stamped.
 */
class BrandController extends Controller
{
    public function index(): JsonResponse
    {
        $brands = Brand::orderBy('sort_order')
            ->orderBy('name')
            ->get([
                'id', 'name', 'slug', 'description', 'logo_url', 'primary_color',
                'widget_token', 'is_default', 'sort_order', 'created_at',
                // Phase 3: per-brand PMS columns. Surface to the admin SPA so the
                // Brands page can show the integration status. The value itself is
                // safe to expose — admins are the only callers.
                'pms_smoobu_api_key', 'pms_smoobu_channel_id',
            ])
            ->map(function ($brand) {
                // Strip the actual secret but keep a "configured" flag so the
                // UI can render a green dot without leaking the key. Admins
                // can still set/replace it via the update endpoint.
                $hasKey = !empty($brand->pms_smoobu_api_key);
                $brand->offsetUnset('pms_smoobu_api_key');
                $brand->setAttribute('has_pms_smoobu_key', $hasKey);
                return $brand;
            });

        return response()->json([
            'data'  => $brands,
            'count' => $brands->count(),
        ]);
    }

    /**
     * GET /v1/admin/brands/stats
     *
     * Per-brand activity counts — last 30 days, used by the Brands settings
     * page to render usage badges on each brand card. Stats are computed in
     * a single roundtrip with three grouped COUNTs to avoid N+1 lookups.
     *
     * Returns a map keyed by brand_id with `inquiries`, `bookings`, `chats`
     * counts. Brands with zero rows in any category get explicit `0` so
     * the frontend doesn't have to coalesce nulls.
     */
    public function stats(): JsonResponse
    {
        $orgId = app('current_organization_id');
        $since = now()->subDays(30);

        $brandIds = Brand::pluck('id')->all();
        $base = array_fill_keys($brandIds, ['inquiries' => 0, 'bookings' => 0, 'chats' => 0]);

        $hydrate = function (string $table, string $key) use ($orgId, $since, &$base) {
            if (!\Schema::hasTable($table) || !\Schema::hasColumn($table, 'brand_id')) {
                return;
            }
            $rows = DB::table($table)
                ->select('brand_id', DB::raw('count(*) as c'))
                ->where('organization_id', $orgId)
                ->where('created_at', '>=', $since)
                ->whereNotNull('brand_id')
                ->groupBy('brand_id')
                ->pluck('c', 'brand_id');
            foreach ($rows as $brandId => $c) {
                if (isset($base[$brandId])) $base[$brandId][$key] = (int) $c;
            }
        };

        $hydrate('inquiries',           'inquiries');
        $hydrate('booking_submissions', 'bookings');
        $hydrate('chat_conversations',  'chats');

        return response()->json(['data' => $base]);
    }

    public function show(int $id): JsonResponse
    {
        $brand = Brand::findOrFail($id);
        return response()->json($brand);
    }

    public function store(Request $request): JsonResponse
    {
        $orgId = app('current_organization_id');

        $data = $request->validate([
            'name'          => 'required|string|max:120',
            'slug'          => [
                'nullable', 'string', 'max:100',
                Rule::unique('brands')->where(fn ($q) => $q->where('organization_id', $orgId)->whereNull('deleted_at')),
            ],
            'description'   => 'nullable|string|max:1000',
            'primary_color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'logo'          => 'nullable|image|mimes:jpeg,png,jpg,webp,svg|max:5120',
            // Per-brand PMS (Phase 3). Optional — when blank, falls back to
            // org-level hotel_settings inside SmoobuClient.
            'pms_smoobu_api_key'    => 'nullable|string|max:200',
            'pms_smoobu_channel_id' => 'nullable|string|max:100',
        ]);

        // Strip non-model file from $data so it doesn't leak to model assignment.
        unset($data['logo']);

        if (empty($data['slug'])) {
            $data['slug'] = $this->uniqueSlugWithinOrg($orgId, $data['name']);
        }

        $brand = new Brand($data);
        $brand->organization_id = $orgId;
        $brand->is_default = false; // never auto-promote a freshly created brand
        $brand->save();

        if ($request->hasFile('logo')) {
            $brand->logo_url = MediaService::upload($request->file('logo'), 'brand-logos');
            $brand->save();
        }

        return response()->json($brand, 201);
    }

    public function update(int $id, Request $request): JsonResponse
    {
        $brand = Brand::findOrFail($id);
        $orgId = app('current_organization_id');

        $data = $request->validate([
            'name'          => 'sometimes|string|max:120',
            'slug'          => [
                'sometimes', 'string', 'max:100',
                Rule::unique('brands')
                    ->where(fn ($q) => $q->where('organization_id', $orgId)->whereNull('deleted_at'))
                    ->ignore($brand->id),
            ],
            'description'   => 'sometimes|nullable|string|max:1000',
            'primary_color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'logo'          => 'sometimes|image|mimes:jpeg,png,jpg,webp,svg|max:5120',
            'sort_order'    => 'sometimes|integer|min:0|max:9999',
            'pms_smoobu_api_key'    => 'sometimes|nullable|string|max:200',
            'pms_smoobu_channel_id' => 'sometimes|nullable|string|max:100',
        ]);

        unset($data['logo']);
        $brand->fill($data);
        $brand->save();

        if ($request->hasFile('logo')) {
            $brand->logo_url = MediaService::upload($request->file('logo'), 'brand-logos');
            $brand->save();
        }

        return response()->json($brand);
    }

    /**
     * Promote a brand to be the org's default. Atomic: un-defaults the
     * current default in the same transaction so the partial unique index
     * (`brands_org_default_unique`) is never violated.
     */
    public function setDefault(int $id): JsonResponse
    {
        $brand = Brand::findOrFail($id);

        DB::transaction(function () use ($brand) {
            Brand::where('organization_id', $brand->organization_id)
                ->where('is_default', true)
                ->update(['is_default' => false]);

            $brand->is_default = true;
            $brand->save();
        });

        return response()->json($brand->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        $brand = Brand::findOrFail($id);

        if ($brand->is_default) {
            return response()->json([
                'error'   => 'Cannot delete default brand',
                'message' => 'Designate another brand as the default before deleting this one.',
            ], 422);
        }

        // Phase 1: no brand-scoped data exists yet, so a soft delete is safe.
        // Phase 2+ migrations will need to handle re-assignment when we add
        // `brand_id` to chatbot/widget/booking tables. We'll guard those at
        // that point — for now there is nothing to migrate away from.
        $brand->delete();

        return response()->json(['message' => 'Brand deleted']);
    }

    /**
     * Generate a URL-safe slug that doesn't already exist for this org.
     * Falls back to "<slug>-2", "<slug>-3", … when the base slug is taken.
     */
    private function uniqueSlugWithinOrg(int $orgId, string $name): string
    {
        $base = Str::slug($name) ?: 'brand';
        $slug = $base;
        $i = 2;

        while (Brand::where('organization_id', $orgId)->where('slug', $slug)->exists()) {
            $slug = $base . '-' . $i;
            $i++;
        }

        return $slug;
    }
}
