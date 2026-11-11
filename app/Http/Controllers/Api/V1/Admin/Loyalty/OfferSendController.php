<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\SpecialOffer;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\Offers\OfferDelivery;
use Illuminate\Http\Request;

class OfferSendController extends Controller
{
    public function preview(Request $request, int $id, OfferDelivery $delivery): \Illuminate\Http\JsonResponse
    {
        $ids = $this->members($request);
        $preview = $delivery->preview(SpecialOffer::query()->findOrFail($id), $ids);
        return response()->json(['revision' => $preview['revision'], 'counts' => $preview['counts'], 'offer' => $preview['offer']]);
    }

    public function store(Request $request, int $id, OfferDelivery $delivery): \Illuminate\Http\JsonResponse
    {
        $ids = $this->members($request);
        $data = $request->validate(['revision' => 'required|string|size:64', 'idempotency_key' => 'required|string|max:80|regex:/^[A-Za-z0-9-]+$/']);
        return response()->json($delivery->send(SpecialOffer::query()->findOrFail($id), $request->user(), $ids, $data['revision'], $data['idempotency_key']));
    }

    private function members(Request $request): array
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        return $request->validate(['member_ids' => 'required|array|min:1|max:5000', 'member_ids.*' => ['integer', 'distinct', OwnRows::rule('loyalty_members')]])['member_ids'];
    }
}
