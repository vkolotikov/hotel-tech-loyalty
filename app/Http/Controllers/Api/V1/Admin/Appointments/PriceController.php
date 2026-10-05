<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\MemberOffer;
use App\Models\RewardRedemption;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Money\StaffPricing;
use App\Services\Appointments\StaffBookingWriter;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponResolver;
use App\Services\Booking\CouponSelection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The price of an appointment staff are about to book, and the member's coupons (Part E §6). */
class PriceController extends Controller
{
    public function quote(Request $request, StaffPricing $pricing, StaffBookingWriter $writer): JsonResponse
    {
        $data = $request->validate([
            'client_id'              => 'required|integer',
            'service_id'             => 'required|integer',
            'master_id'              => 'required|integer',
            'start'                  => 'required|string|max:16',
            'coupon'                 => 'nullable|array',
            'coupon.member_offer_id' => 'nullable|integer',
            'coupon.redemption_id'   => 'nullable|integer',
        ]);
        $client = Guest::find($data['client_id']) ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);
        $service = Service::where('is_active', true)->find($data['service_id']) ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $master = ServiceMaster::where('is_active', true)->find($data['master_id']) ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
        $start = $writer->startOrRefuse($data['start'], (int) app('current_organization_id'));

        try {
            $p = $pricing->quote($client, $service, $master, $start->toIso8601String(), CouponSelection::fromArray($data['coupon'] ?? null));
        } catch (CouponException $e) {
            throw new AppointmentRefused($e->errorCode, $e->sentence(), 422);
        } catch (\PDOException $e) {
            throw $e;
        } catch (\RuntimeException) {
            throw new AppointmentRefused('slot_taken', "That time is not free for {$master->name}. Choose another.", 409);
        }

        return response()->json($p->toArray() + ['member' => StaffPricing::memberFor($client) !== null]);
    }

    public function coupons(int $id): JsonResponse
    {
        $member = $this->memberOf($id);
        if ($member === null) {
            return response()->json(['coupons' => []]);
        }

        $offers = MemberOffer::with('offer')->where('member_id', $member->id)->where('status', 'claimed')->whereNull('used_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->get()
            ->filter(fn (MemberOffer $c) => $c->offer !== null)
            ->map(fn (MemberOffer $c) => ['kind' => 'offer', 'coupon' => ['member_offer_id' => $c->id], 'label' => (string) $c->offer->title]);
        $rewards = RewardRedemption::with('reward')->where('member_id', $member->id)->where('status', RewardRedemption::STATUS_PENDING)->get()
            ->filter(fn (RewardRedemption $r) => $r->reward !== null && (float) $r->reward->discount_value > 0)
            ->map(fn (RewardRedemption $r) => ['kind' => 'reward', 'coupon' => ['redemption_id' => $r->id], 'label' => (string) $r->reward->name]);

        return response()->json(['coupons' => $offers->concat($rewards)->values()->all()]);
    }

    public function resolveCoupon(Request $request, int $id, CouponResolver $resolver): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:64']);
        $member = $this->memberOf($id) ?? throw new AppointmentRefused('coupon_not_found', 'Coupons need an active membership.', 422);
        try {
            return response()->json(['coupon' => $resolver->resolveCode($member, $data['code'])]);
        } catch (CouponException $e) {
            throw new AppointmentRefused($e->errorCode, $e->sentence(), 422);
        }
    }

    private function memberOf(int $clientId): ?\App\Models\LoyaltyMember
    {
        $client = Guest::find($clientId) ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);

        return StaffPricing::memberFor($client);
    }
}
