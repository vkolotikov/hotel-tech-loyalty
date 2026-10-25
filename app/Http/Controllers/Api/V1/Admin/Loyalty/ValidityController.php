<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\MemberProfile;
use App\Services\Loyalty\Members\MembershipValidity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * A membership's end date: set, extend or remove it (release 8, spec 2026-10-25 §3) — `PUT members/{id}/validity`, a
 * manager's (as a tier change; AccessMap `admin/loyalty/members/{id}/validity`). The writing and its rules are
 * MembershipValidity's; this checks who asks, names this organisation's member only, and refuses a deleted one.
 *
 * Body: `{ valid_until: 'Y-m-d' | null }` or `{ extend: '1m' | '3m' | '6m' | '1y' }`, and `idempotency_key` (or the
 * `Idempotency-Key` header when the body has none), kept per organisation and member. Answer: `{ member, valid_until,
 * state, changed, replayed }` — the member as their page shows them (MemberProfile), the end date and its state.
 */
class ValidityController extends Controller
{
    public function update(Request $request, int $id, MembershipValidity $validity): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $member = LoyaltyMember::query()->with('user')->find($id) ?? throw LoyaltyRefused::notFound();
        if (MemberErasure::isErased($member)) {
            throw new LoyaltyRefused('already_erased', 'This member was deleted.', 409);
        }
        $data = $request->validate([
            'valid_until'     => 'sometimes|nullable|string|max:10',
            'extend'          => ['sometimes', 'nullable', 'string', Rule::in(array_keys(MembershipValidity::EXTENSIONS))],
            'idempotency_key' => 'nullable|string|max:64',
        ]);

        $change = [];
        if ($request->exists('valid_until')) {
            $change['valid_until'] = $data['valid_until'] ?? null;
        }
        if (($data['extend'] ?? null) !== null) {
            $change['extend'] = $data['extend'];
        }

        $done = $validity->change($member, $change, $request->user(), $this->key($request, $data));

        return response()->json([
            'member'      => MemberProfile::of($done['member']),
            'valid_until' => $done['valid_until'],
            'state'       => $done['state'],
            'changed'     => $done['changed'],
            'replayed'    => $done['replayed'],
        ]);
    }

    /** The retry key: the body's, else the `Idempotency-Key` header's; none means no replay. @param array<string, mixed> $data */
    private function key(Request $request, array $data): ?string
    {
        $sent = trim((string) ($data['idempotency_key'] ?? ''));
        if ($sent === '') {
            $sent = trim((string) $request->header('Idempotency-Key', ''));
            if (mb_strlen($sent) > 64) {
                throw ValidationException::withMessages(['idempotency_key' => ['The Idempotency-Key header may hold at most 64 characters.']]);
            }
        }

        return $sent === '' ? null : $sent;
    }
}
