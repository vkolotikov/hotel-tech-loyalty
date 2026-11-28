<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\NfcCard;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\Cards\NfcCards;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PhysicalCardsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        LoyaltyAccess::requireActiveStaff($request->user());
        $data = $request->validate([
            'batch_id' => 'nullable|integer|min:1',
            'q'        => 'nullable|string|max:24',
            'page'     => 'nullable|integer|min:1',
        ]);

        // The print format allows letters, numbers, spaces and hyphens. Search with or without its spaces.
        $query = strtoupper(str_replace(' ', '', $data['q'] ?? ''));
        $cards = NfcCard::query()->printed()->with('member.user')
            ->when(isset($data['batch_id']), fn ($rows) => $rows->where('card_batch_id', $data['batch_id']))
            ->when($query !== '', fn ($rows) => $rows->whereRaw(
                "REPLACE(printed_number, ' ', '') LIKE ? ESCAPE '!'",
                ['%'.strtr($query, ['!' => '!!', '%' => '!%', '_' => '!_']).'%'],
            ))
            ->orderByDesc('card_batch_id')->orderBy('id')->paginate(25);

        return response()->json([
            'cards' => $cards->getCollection()->map(fn (NfcCard $card) => NfcCards::printedRow($card)),
            'page'  => $cards->currentPage(),
            'pages' => $cards->lastPage(),
            'total' => $cards->total(),
        ]);
    }

    public function pair(Request $request, int $id, NfcCards $cards): JsonResponse
    {
        LoyaltyAccess::requireActiveStaff($request->user());
        $data = $request->validate([
            'uid'          => 'required|string|max:100',
            'expected_uid' => 'present|nullable|string|max:50',
            'replace_active' => 'sometimes|boolean',
        ]);
        $replace = $request->boolean('replace_active');
        if ($replace) {
            LoyaltyAccess::requireManager($request->user());
        }
        $card = $cards->pairPrinted($id, $data['uid'], $data['expected_uid'], $request->user(), $replace);
        $next = NfcCard::query()->where('card_batch_id', $card->card_batch_id)->whereNull('uid')
            ->where('id', '>', $card->id)->orderBy('id')->with('member.user')->first();

        return response()->json([
            'card' => NfcCards::printedRow($card),
            'next' => $next ? NfcCards::printedRow($next) : null,
        ]);
    }

    public function assign(Request $request, int $id, NfcCards $cards): JsonResponse
    {
        LoyaltyAccess::requireActiveStaff($request->user());
        $data = $request->validate([
            'member_id' => ['required', 'integer', OwnRows::rule('loyalty_members')],
            'uid' => 'sometimes|required|string|max:100',
            'expected_uid' => 'present_with:uid|nullable|string|max:50',
        ]);
        $card = $cards->assignPrinted($id, (int) $data['member_id'], $request->user(), $data['uid'] ?? null, $data['expected_uid'] ?? null);

        return response()->json(['card' => NfcCards::printedRow($card)]);
    }

    public function tagLookup(Request $request, NfcCards $cards): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['uid' => 'required|string|max:100']);

        return response()->json([
            'cards' => $cards->findTags($data['uid'])->map(fn (NfcCard $card) => NfcCards::tagRow($card)),
        ], headers: ['Cache-Control' => 'private, no-store']);
    }

    public function releaseTag(Request $request, int $id, NfcCards $cards): Response
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['expected_uid' => 'required|string|max:50']);
        $cards->releaseTag($id, $data['expected_uid'], $request->user());

        return response()->noContent();
    }

    public function qr(Request $request, int $id, NfcCards $cards, QrCodeService $qr): JsonResponse
    {
        LoyaltyAccess::requireActiveStaff($request->user());
        $code = NfcCards::scanCode($cards->printed($id));

        return response()->json(['code' => $code, 'qr_svg' => $qr->cardQrDataUri($code)], headers: ['Cache-Control' => 'private, no-store']);
    }
}
