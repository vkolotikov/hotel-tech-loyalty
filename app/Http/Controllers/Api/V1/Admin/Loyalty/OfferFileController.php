<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\SpecialOffer;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\Offers\OfferFiles;
use Illuminate\Http\Request;

class OfferFileController extends Controller
{
    public function show(int $id): \Illuminate\Http\Response
    {
        return OfferFiles::download(SpecialOffer::query()->findOrFail($id));
    }

    public function store(Request $request, int $id, OfferFiles $files): \Illuminate\Http\JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        $offer = SpecialOffer::query()->findOrFail($id);
        $request->validate(['attachment' => 'required|file|max:5120']);
        $files->put($offer, $request->file('attachment'));
        return response()->json(['attachment' => OfferFiles::metadata($offer->fresh())]);
    }

    public function destroy(Request $request, int $id, OfferFiles $files): \Illuminate\Http\JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::MANAGE_REWARDS);
        $files->remove(SpecialOffer::query()->findOrFail($id));
        return response()->json(['attachment' => null]);
    }

    public function member(Request $request, int $id): \Illuminate\Http\Response
    {
        $member = $request->user()->loyaltyMember()->firstOrFail();
        $offer = SpecialOffer::query()->findOrFail($id);
        abort_unless($member->is_active && $offer->canDeliver() && $offer->allowsMembership($member), 404);
        return OfferFiles::download($offer);
    }
}
