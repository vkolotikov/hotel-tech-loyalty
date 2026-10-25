<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * A member's cashback credit in the workspace (release 7, spec 2026-10-25 §3): the lines, spending it at the desk
 * (R7-2: the only place credit is spent; `can_redeem_points`, as Redeem) and a manager's correction. The writing and
 * every money rule are CreditLedger's; this checks who asks, and names this organisation's member only.
 *
 * Every write is idempotent: the `idempotency_key` body field (or the `Idempotency-Key` header when the body has none)
 * is kept per organisation, member and kind of write, so it can never name another member's line; a call without one
 * gets a key of its own (a retry of it writes again).
 */
class CreditController extends Controller
{
    public function show(Request $request, int $id, CreditLedger $ledger): JsonResponse
    {
        $member = $this->member($id);

        return response()->json($ledger->forMember($member, max(1, (int) $request->query('page', 1))));
    }

    public function spend(Request $request, int $id, CreditLedger $ledger): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::REDEEM);
        $data = $request->validate([
            'amount'          => 'required|numeric|gt:0|max:' . CreditLedger::MAX_AMOUNT,
            'note'            => 'nullable|string|max:200',
            'idempotency_key' => 'nullable|string|max:64',
        ]);
        $member = $this->member($id);
        $note = trim((string) ($data['note'] ?? ''));

        $done = $ledger->spend($member, (float) $data['amount'], $request->user(), $note === '' ? null : $note, $this->key($request, $member, 'spend', $data));

        return response()->json($this->after($member, $done));
    }

    public function adjust(Request $request, int $id, CreditLedger $ledger): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $max = CreditLedger::MAX_AMOUNT;
        $data = $request->validate([
            'amount'          => "required|numeric|between:-{$max},{$max}",
            'reason'          => 'required|string|min:2|max:200',
            'idempotency_key' => 'nullable|string|max:64',
        ]);
        $member = $this->member($id);

        $done = $ledger->adjust($member, (float) $data['amount'], trim($data['reason']), $request->user(), $this->key($request, $member, 'adjust', $data));

        return response()->json($this->after($member, $done));
    }

    /**
     * The ledger's answer with the member's row after it (as the list shows it, `credit_balance` included).
     *
     * @param array<string, mixed> $done
     * @return array<string, mixed>
     */
    private function after(LoyaltyMember $member, array $done): array
    {
        return $done + ['member' => MemberDirectory::row(LoyaltyMember::query()->with('user')->findOrFail($member->id))];
    }

    /** The retry key, kept per organisation, member and kind of write; at most the column's 120 characters. @param array<string, mixed> $data */
    private function key(Request $request, LoyaltyMember $member, string $kind, array $data): string
    {
        $sent = trim((string) ($data['idempotency_key'] ?? ''));
        if ($sent === '') {
            $sent = trim((string) $request->header('Idempotency-Key', ''));
            if (mb_strlen($sent) > 64) {
                throw ValidationException::withMessages(['idempotency_key' => ['The Idempotency-Key header may hold at most 64 characters.']]);
            }
        }
        $scope = "credit-ws:{$member->organization_id}:{$member->id}:{$kind}:";
        if ($sent === '') {
            return $scope . Str::uuid()->toString();
        }

        return strlen($scope . $sent) <= 120 ? $scope . $sent : $scope . sha1($sent);
    }

    private function member(int $id): LoyaltyMember
    {
        return LoyaltyMember::query()->with('user')->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
