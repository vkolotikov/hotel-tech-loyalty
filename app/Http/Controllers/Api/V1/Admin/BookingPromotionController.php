<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BookingPromotion;
use App\Models\BookingRoom;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Booking\StayPromotions;
use App\Services\BookingEngineService;
use App\Services\Portal\PortalBootstrap;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BookingPromotionController extends Controller
{
    public function index(): JsonResponse
    {
        $org = (int) app('current_organization_id');
        $stats = DB::table('booking_promotion_uses')->where('organization_id', $org)->selectRaw('promotion_id, COUNT(*) as bookings, SUM(discount_amount) as discounts, SUM(accommodation_total) as accommodation_revenue')->groupBy('promotion_id')->get()->keyBy('promotion_id');
        return response()->json([
            'enabled' => StayPromotions::enabled(), 'timezone' => $this->zone(), 'currency' => BookingEngineService::stayCurrency(),
            'rooms' => BookingRoom::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'promotions' => BookingPromotion::orderByDesc('id')->get()->map(fn ($p) => $this->dto($p) + ['stats' => $stats[$p->id] ?? ['bookings' => 0, 'discounts' => 0, 'accommodation_revenue' => 0]]),
        ]);
    }

    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate(['enabled' => 'required|boolean']);
        HotelSetting::updateOrCreate(['key' => 'booking_promotions_enabled'], ['value' => $data['enabled'] ? '1' : '0', 'type' => 'boolean', 'group' => 'booking']);
        AuditLog::record('booking.promotions_enabled', null, $data, [], $request->user());
        return response()->json(['enabled' => $data['enabled']]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $p = DB::transaction(function () use ($data, $request) {
            $p = BookingPromotion::create($data + ['organization_id' => (int) app('current_organization_id')]);
            AuditLog::record('booking.promotion_created', $p, $p->toArray(), [], $request->user());
            return $p;
        });
        return response()->json($this->dto($p), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $p = BookingPromotion::findOrFail($id);
        $data = $this->validated($request, $p);
        $revision = $request->validate(['revision' => 'required|integer|min:1'])['revision'];
        return DB::transaction(function () use ($p, $data, $revision, $request) {
            $before = $p->toArray();
            $changed = BookingPromotion::whereKey($p->id)->where('revision', $revision)->update($data + ['revision' => $revision + 1]);
            if (!$changed) return response()->json(['message' => 'This promotion changed. Refresh before saving.', 'code' => 'stale'], 409);
            AuditLog::record('booking.promotion_updated', $p, $data, $before, $request->user());
            return response()->json($this->dto($p->fresh()));
        });
    }

    private function validated(Request $request, ?BookingPromotion $promotion = null): array
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        $roomRule = OwnRows::rule('booking_rooms')->where('is_active', true);
        if (app()->bound('current_brand_id') && app('current_brand_id')) $roomRule->where('brand_id', app('current_brand_id'));
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'code' => ['required', 'string', 'max:32', 'regex:/^[A-Z0-9][A-Z0-9_-]{1,31}$/', Rule::unique('booking_promotions', 'code')->where('organization_id', (int) app('current_organization_id'))->ignore($promotion?->id)],
            'type' => 'required|in:percentage,fixed_amount,second_night_free', 'value' => 'required|numeric|min:0|max:9999999',
            'status' => 'required|in:draft,published,paused,archived',
            'booking_from' => 'nullable|date_format:Y-m-d\TH:i', 'booking_until' => 'nullable|date_format:Y-m-d\TH:i|after:booking_from',
            'stay_from' => 'nullable|date_format:Y-m-d', 'stay_until' => 'nullable|date_format:Y-m-d|after_or_equal:stay_from',
            'min_nights' => 'required|integer|min:1|max:365',
            'room_ids' => 'present|array|max:200', 'room_ids.*' => ['integer', 'distinct', $roomRule],
            'excluded_dates' => 'present|array|max:200', 'excluded_dates.*.from' => 'required|date_format:Y-m-d', 'excluded_dates.*.until' => 'required|date_format:Y-m-d',
        ]);
        if ($data['type'] === 'percentage' && ($data['value'] <= 0 || $data['value'] > 100)) throw ValidationException::withMessages(['value' => 'Enter a percentage above 0 and up to 100.']);
        if ($data['type'] === 'fixed_amount' && $data['value'] <= 0) throw ValidationException::withMessages(['value' => 'Enter a positive amount.']);
        if ($data['type'] === 'second_night_free') { $data['value'] = 0; $data['min_nights'] = max(2, $data['min_nights']); }
        foreach ($data['excluded_dates'] as $i => $range) {
            if ($range['until'] < $range['from']) throw ValidationException::withMessages(["excluded_dates.$i.until" => 'The last night must follow the first night.']);
        }
        if ($data['status'] === 'published' && (empty($data['booking_from']) || empty($data['booking_until']))) throw ValidationException::withMessages(['booking_from' => 'Published promotions need a booking start and end.']);
        $zone = $this->zone();
        foreach (['booking_from', 'booking_until'] as $key) $data[$key] = empty($data[$key]) ? null : CarbonImmutable::createFromFormat('!Y-m-d\TH:i', $data[$key], $zone)->utc();
        $data['currency'] = BookingEngineService::stayCurrency();
        return $data;
    }

    private function dto(BookingPromotion $p): array
    {
        $zone = $this->zone();
        $state = $p->status;
        if ($state === 'published') $state = $p->booking_from?->isFuture() ? 'scheduled' : ($p->booking_until?->isPast() ? 'expired' : 'active');
        return array_merge($p->toArray(), ['room_ids' => $p->room_ids ?? [], 'excluded_dates' => $p->excluded_dates ?? [], 'state' => $state, 'booking_from' => $p->booking_from?->setTimezone($zone)->format('Y-m-d\TH:i'), 'booking_until' => $p->booking_until?->setTimezone($zone)->format('Y-m-d\TH:i')]);
    }

    private function zone(): string
    {
        return PortalBootstrap::timezone(Organization::findOrFail((int) app('current_organization_id')));
    }
}
