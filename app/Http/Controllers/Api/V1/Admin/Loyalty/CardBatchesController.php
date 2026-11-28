<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyCardBatch;
use App\Services\Loyalty\Cards\PhysicalCardBatches;
use App\Services\Loyalty\Cards\PhysicalCardQrArchive;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class CardBatchesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        LoyaltyAccess::requireActiveStaff($request->user());

        return response()->json([
            'batches' => LoyaltyCardBatch::query()->latest('id')->get(['id', 'first_number', 'last_number', 'card_count']),
            'limit'   => PhysicalCardBatches::LIMIT,
        ]);
    }

    public function store(Request $request, PhysicalCardBatches $batches): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate([
            'prefix' => ['nullable', 'string', 'regex:/\A[A-Za-z0-9][A-Za-z0-9-]{0,11}\z/'],
            'first'  => ['required', 'string', 'regex:/\A[0-9]{1,9}\z/'],
            'last'   => ['required', 'string', 'regex:/\A[0-9]{1,9}\z/'],
        ]);

        $result = $batches->create($data['prefix'] ?? '', $data['first'], $data['last'], $request->user());

        return response()->json(['batch' => $result['batch']->only(['id', 'first_number', 'last_number', 'card_count'])],
            $result['created'] ? 201 : 200);
    }

    public function qr(Request $request, int $id, PhysicalCardQrArchive $archive): BinaryFileResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $batch = LoyaltyCardBatch::query()->find($id) ?? throw LoyaltyRefused::notFound();

        return $archive->download($batch);
    }
}
