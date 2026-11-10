<?php
namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\V1\Admin\TeamController;
use App\Models\AccessPlace;
use App\Models\Staff;
use App\Services\Loyalty\LoyaltyAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Workspace adapter to the canonical Team invitations and account lifecycle. */
final class PartnerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        return response()->json([
            'partners' => Staff::where('loyalty_scan_only', true)->with('user:id,name,email')->orderBy('id')->get()->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->user?->name, 'email' => $s->user?->email,
                'is_active' => (bool) $s->is_active, 'place_ids' => $s->loyalty_place_ids ?? [],
                'accepted' => $s->last_login_at !== null,
            ]),
            'places' => AccessPlace::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function invite(Request $request, TeamController $team): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['name' => 'required|string|max:200', 'email' => 'required|email|max:200', 'loyalty_place_ids' => 'required|array|min:1']);
        $existing = Staff::whereHas('user', fn ($q) => $q->where('email', strtolower(trim($data['email']))))->first();
        if ($existing && !$existing->loyalty_scan_only) {
            throw ValidationException::withMessages(['email' => ['This person already has a different team role. Manage it in Team settings.']]);
        }
        $request->replace($data + ['role' => 'staff', 'loyalty_scan_only' => true]);
        return $team->invite($request);
    }

    private function partner(Request $request, int $id): Staff
    {
        LoyaltyAccess::requireManager($request->user());
        return Staff::where('loyalty_scan_only', true)->findOrFail($id);
    }

    public function update(Request $request, int $id, TeamController $team): JsonResponse
    {
        $this->partner($request, $id);
        $data = $request->validate(['loyalty_place_ids' => 'required|array|min:1']);
        $request->replace($data + ['role' => 'staff', 'loyalty_scan_only' => true]);
        return $team->update($request, $id);
    }

    public function state(Request $request, int $id, TeamController $team): JsonResponse
    {
        $this->partner($request, $id);
        $data = $request->validate(['is_active' => 'required|boolean']);
        return $data['is_active'] ? $team->reactivate($request, $id) : $team->deactivate($request, $id);
    }

    public function resend(Request $request, int $id, TeamController $team): JsonResponse
    {
        $this->partner($request, $id);
        return $team->resend($request, $id);
    }
}
