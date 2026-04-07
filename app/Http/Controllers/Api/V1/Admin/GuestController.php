<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\GuestActivity;
use App\Models\GuestImportRun;
use App\Models\GuestSegment;
use App\Models\GuestTag;
use App\Services\GuestMemberLinkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class GuestController extends Controller
{
    public function __construct(
        protected GuestMemberLinkService $linkService,
    ) {}
    public function index(Request $request): JsonResponse
    {
        $query = Guest::query();
        $this->applyFilters($query, $request);

        $sort = $request->get('sort', 'created_at');
        $dir  = $request->get('dir', 'desc');
        $query->orderBy($sort, $dir);

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'salutation'         => 'nullable|string|max:20',
            'first_name'         => 'nullable|string|max:100',
            'last_name'          => 'nullable|string|max:100',
            'full_name'          => 'required|string|max:200',
            'email'              => 'nullable|email|max:150',
            'phone'              => 'nullable|string|max:50',
            'mobile'             => 'nullable|string|max:50',
            'company'            => 'nullable|string|max:200',
            'position_title'     => 'nullable|string|max:100',
            'guest_type'         => 'nullable|string|max:30',
            'nationality'        => 'nullable|string|max:100',
            'country'            => 'nullable|string|max:100',
            'city'               => 'nullable|string|max:100',
            'address'            => 'nullable|string',
            'postal_code'        => 'nullable|string|max:20',
            'date_of_birth'      => 'nullable|date',
            'passport_no'        => 'nullable|string|max:50',
            'id_number'          => 'nullable|string|max:50',
            'vip_level'          => 'nullable|string|max:30',
            'loyalty_tier'       => 'nullable|string|max:30',
            'loyalty_id'         => 'nullable|string|max:50',
            'preferred_language' => 'nullable|string|max:30',
            'preferred_room_type'=> 'nullable|string|max:100',
            'preferred_floor'    => 'nullable|string|max:20',
            'dietary_preferences'=> 'nullable|string',
            'special_needs'      => 'nullable|string',
            'email_consent'      => 'nullable|boolean',
            'marketing_consent'  => 'nullable|boolean',
            'lead_source'        => 'nullable|string|max:100',
            'owner_name'         => 'nullable|string|max:150',
            'lifecycle_status'   => 'nullable|string|max:50',
            'importance'         => 'nullable|string|max:30',
            'member_id'          => 'nullable|integer|exists:loyalty_members,id',
            'notes'              => 'nullable|string',
        ]);

        if (!empty($v['email'])) $v['email_key'] = Guest::normalizeEmailKey($v['email']);
        if (!empty($v['phone'])) $v['phone_key'] = Guest::normalizePhoneKey($v['phone']);

        // Strip nulls so DB column defaults (e.g. guest_type='Individual',
        // vip_level='Standard') apply instead of Postgres rejecting explicit
        // nulls against NOT NULL columns. The frontend sends undefined fields
        // as null, which is fine for nullable columns but breaks the ones that
        // have a default-but-not-null constraint.
        $v = array_filter($v, fn($val) => $val !== null);

        try {
            $guest = Guest::create($v);
        } catch (\Throwable $e) {
            \Log::error('Guest store failed', [
                'error'      => $e->getMessage(),
                'org_bound'  => app()->bound('current_organization_id'),
                'org_id'     => app()->bound('current_organization_id') ? app('current_organization_id') : null,
                'fields'     => array_keys($v),
            ]);
            return response()->json([
                'message' => 'Failed to create guest: ' . $e->getMessage(),
            ], 500);
        }

        try {
            $this->linkService->linkGuestToMember($guest);
        } catch (\Throwable $e) {
            // Linking is best-effort — don't fail guest creation if matching fails.
            \Log::warning('Guest member linking failed', ['guest_id' => $guest->id, 'error' => $e->getMessage()]);
        }

        return response()->json($guest->fresh(), 201);
    }

    public function show(int $id): JsonResponse
    {
        // Explicit lookup so we can return precise errors instead of a generic 404
        // from route model binding (which respects TenantScope and silently 404s
        // when the guest exists but belongs to a different organization).
        $guest = Guest::find($id);

        if (!$guest) {
            // Diagnose: does the row exist at all (cross-tenant)?
            $exists = Guest::withoutGlobalScopes()->where('id', $id)->exists();
            \Log::warning('Guest show 404', [
                'id' => $id,
                'exists_cross_tenant' => $exists,
                'current_org' => app()->bound('current_organization_id') ? app('current_organization_id') : null,
            ]);
            return response()->json([
                'message' => $exists
                    ? 'Guest belongs to a different organization.'
                    : 'Guest not found.',
            ], 404);
        }

        try {
            $guest->load([
                'inquiries'    => fn($q) => $q->with('property:id,name,code')->latest()->limit(20),
                'reservations' => fn($q) => $q->with('property:id,name,code')->latest('check_in')->limit(20),
                'activities'   => fn($q) => $q->latest()->limit(30),
                'tags',
                'member.tier',
            ]);
        } catch (\Throwable $e) {
            \Log::error('Guest show load failed', ['id' => $id, 'error' => $e->getMessage()]);
            // Still return the base guest record so the page can render
        }

        return response()->json($guest);
    }

    public function inquiries(int $id): JsonResponse
    {
        $guest = Guest::find($id);
        if (!$guest) return response()->json(['data' => []]);
        $rows = $guest->inquiries()->with('property:id,name,code')->latest()->limit(50)->get();
        return response()->json(['data' => $rows]);
    }

    public function reservations(int $id): JsonResponse
    {
        $guest = Guest::find($id);
        if (!$guest) return response()->json(['data' => []]);
        $rows = $guest->reservations()->with('property:id,name,code')->latest('check_in')->limit(50)->get();
        return response()->json(['data' => $rows]);
    }

    public function activities(int $id): JsonResponse
    {
        $guest = Guest::find($id);
        if (!$guest) return response()->json(['data' => []]);
        $rows = $guest->activities()->latest()->limit(100)->get();
        return response()->json(['data' => $rows]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        // Explicit lookup so the cross-tenant case returns a clear error rather
        // than a silent 404 from route model binding under TenantScope.
        $guest = Guest::find($id);
        if (!$guest) {
            $exists = Guest::withoutGlobalScopes()->where('id', $id)->exists();
            return response()->json([
                'message' => $exists ? 'Guest belongs to a different organization.' : 'Guest not found.',
            ], 404);
        }

        $v = $request->validate([
            'salutation'         => 'nullable|string|max:20',
            'first_name'         => 'nullable|string|max:100',
            'last_name'          => 'nullable|string|max:100',
            'full_name'          => 'sometimes|string|max:200',
            'email'              => 'nullable|email|max:150',
            'phone'              => 'nullable|string|max:50',
            'mobile'             => 'nullable|string|max:50',
            'company'            => 'nullable|string|max:200',
            'position_title'     => 'nullable|string|max:100',
            'guest_type'         => 'nullable|string|max:30',
            'nationality'        => 'nullable|string|max:100',
            'country'            => 'nullable|string|max:100',
            'city'               => 'nullable|string|max:100',
            'address'            => 'nullable|string',
            'postal_code'        => 'nullable|string|max:20',
            'date_of_birth'      => 'nullable|date',
            'passport_no'        => 'nullable|string|max:50',
            'id_number'          => 'nullable|string|max:50',
            'vip_level'          => 'nullable|string|max:30',
            'loyalty_tier'       => 'nullable|string|max:30',
            'loyalty_id'         => 'nullable|string|max:50',
            'preferred_language' => 'nullable|string|max:30',
            'preferred_room_type'=> 'nullable|string|max:100',
            'preferred_floor'    => 'nullable|string|max:20',
            'dietary_preferences'=> 'nullable|string',
            'special_needs'      => 'nullable|string',
            'email_consent'      => 'nullable|boolean',
            'marketing_consent'  => 'nullable|boolean',
            'lead_source'        => 'nullable|string|max:100',
            'owner_name'         => 'nullable|string|max:150',
            'lifecycle_status'   => 'nullable|string|max:50',
            'importance'         => 'nullable|string|max:30',
            'member_id'          => 'nullable|integer|exists:loyalty_members,id',
            'notes'              => 'nullable|string',
        ]);

        if (isset($v['email'])) $v['email_key'] = Guest::normalizeEmailKey($v['email']);
        if (isset($v['phone'])) $v['phone_key'] = Guest::normalizePhoneKey($v['phone']);

        $guest->update($v);
        if (isset($v['email'])) {
            $this->linkService->linkGuestToMember($guest->fresh());
        }
        return response()->json($guest->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        $guest = Guest::find($id);
        if (!$guest) {
            $exists = Guest::withoutGlobalScopes()->where('id', $id)->exists();
            return response()->json([
                'message' => $exists ? 'Guest belongs to a different organization.' : 'Guest not found.',
            ], 404);
        }

        try {
            $guest->delete();
        } catch (\Throwable $e) {
            \Log::error('Guest destroy failed', ['id' => $id, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to delete guest: ' . $e->getMessage()], 500);
        }
        return response()->json(['message' => 'Guest deleted']);
    }

    public function backfillLinks(): JsonResponse
    {
        $result = $this->linkService->backfillAll();
        return response()->json([
            'message' => "Backfill complete: {$result['linked']} of {$result['checked']} guests linked to members.",
            ...$result,
        ]);
    }

    public function addActivity(Request $request, Guest $guest): JsonResponse
    {
        $v = $request->validate([
            'type'         => 'required|string|max:50',
            'description'  => 'required|string',
            'performed_by' => 'nullable|string|max:150',
        ]);

        $activity = $guest->activities()->create($v);
        $guest->update(['last_activity_at' => now()]);
        return response()->json($activity, 201);
    }

    public function tags(): JsonResponse
    {
        return response()->json(GuestTag::orderBy('name')->get());
    }

    public function storeTag(Request $request): JsonResponse
    {
        $v = $request->validate(['name' => 'required|string|max:80|unique:guest_tags,name', 'color' => 'nullable|string|max:7']);
        return response()->json(GuestTag::create($v), 201);
    }

    public function destroyTag(GuestTag $tag): JsonResponse
    {
        $tag->delete();
        return response()->json(['message' => 'Tag deleted']);
    }

    public function syncTags(Request $request, Guest $guest): JsonResponse
    {
        $v = $request->validate(['tag_ids' => 'array', 'tag_ids.*' => 'integer|exists:guest_tags,id']);
        $guest->tags()->sync($v['tag_ids'] ?? []);
        return response()->json($guest->tags);
    }

    public function segments(): JsonResponse
    {
        return response()->json(GuestSegment::orderBy('name')->get());
    }

    public function storeSegment(Request $request): JsonResponse
    {
        $v = $request->validate(['name' => 'required|string|max:120', 'filters' => 'required|array']);
        return response()->json(GuestSegment::create($v), 201);
    }

    public function destroySegment(GuestSegment $segment): JsonResponse
    {
        $segment->delete();
        return response()->json(['message' => 'Segment deleted']);
    }

    public function bulkUpdate(Request $request): JsonResponse
    {
        $allowedFields = [
            'vip_level', 'segment', 'status', 'language', 'nationality',
            'notes', 'salutation', 'company',
        ];

        $v = $request->validate([
            'ids'    => 'required|array|min:1',
            'ids.*'  => 'integer|exists:guests,id',
            'fields' => 'required|array',
        ]);

        // Strip any fields not in the whitelist to prevent tenant escape / PII manipulation
        $safeFields = array_intersect_key($v['fields'], array_flip($allowedFields));
        if (empty($safeFields)) {
            return response()->json(['error' => 'No valid fields provided'], 422);
        }

        Guest::whereIn('id', $v['ids'])->update($safeFields);
        return response()->json(['updated' => count($v['ids'])]);
    }

    public function export(Request $request): StreamedResponse
    {
        $query = Guest::query();
        $this->applyFilters($query, $request);
        $query->orderBy('full_name');

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['ID','Salutation','Full Name','Email','Phone','Mobile','Company','Guest Type','Nationality','Country','City','VIP Level','Loyalty Tier','Total Stays','Total Nights','Total Revenue','Last Stay','Lead Source','Notes','Created']);

            $query->chunk(500, function ($guests) use ($out) {
                foreach ($guests as $g) {
                    fputcsv($out, [
                        $g->id, $g->salutation, $g->full_name, $g->email, $g->phone, $g->mobile,
                        $g->company, $g->guest_type, $g->nationality, $g->country, $g->city,
                        $g->vip_level, $g->loyalty_tier, $g->total_stays, $g->total_nights,
                        $g->total_revenue, $g->last_stay_date?->toDateString(), $g->lead_source, $g->notes,
                        $g->created_at?->toDateString(),
                    ]);
                }
            });
            fclose($out);
        }, 'guests-' . date('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    private function applyFilters($query, Request $request): void
    {
        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('full_name', 'ilike', "%$s%")
                  ->orWhere('email', 'ilike', "%$s%")
                  ->orWhere('phone', 'ilike', "%$s%")
                  ->orWhere('company', 'ilike', "%$s%")
                  ->orWhere('nationality', 'ilike', "%$s%");
            });
        }
        if ($v = $request->get('country'))          $query->where('country', $v);
        if ($v = $request->get('nationality'))      $query->where('nationality', $v);
        if ($v = $request->get('guest_type'))        $query->where('guest_type', $v);
        if ($v = $request->get('vip_level'))         $query->where('vip_level', $v);
        if ($v = $request->get('lifecycle_status'))   $query->where('lifecycle_status', $v);
        if ($v = $request->get('importance'))         $query->where('importance', $v);
        if ($v = $request->get('lead_source'))        $query->where('lead_source', $v);
        if ($v = $request->get('owner_name'))         $query->where('owner_name', $v);
        if ($v = $request->get('loyalty_tier'))       $query->where('loyalty_tier', $v);
        if ($request->get('has_email'))               $query->whereNotNull('email');
        if ($request->get('has_phone'))               $query->whereNotNull('phone');
        if ($v = $request->get('min_stays'))          $query->where('total_stays', '>=', $v);
        if ($v = $request->get('date_from'))          $query->where('created_at', '>=', $v);
        if ($v = $request->get('date_to'))            $query->where('created_at', '<=', $v . ' 23:59:59');
        if ($v = $request->get('tag_ids')) {
            $ids = is_array($v) ? $v : explode(',', $v);
            $query->whereHas('tags', fn($q) => $q->whereIn('guest_tags.id', $ids));
        }
    }
}
