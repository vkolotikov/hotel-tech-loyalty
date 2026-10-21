<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberDirectory;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\MemberProfile;
use App\Services\MemberMergeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Likely duplicates and the merge (spec 2026-10-21 release 2 §4.1, §4.2), a manager's: the two members of a pair side
 * by side carry personal data. The pairs are MemberMergeService's (the same email in any case, or the same phone by
 * its digits, seven at least), each with every reason it matches and the oldest as the one to keep; the merge is the
 * shared service's, which keeps all history (R2-3).
 *
 * Who may be merged: any two of this organisation's members, active or not — a duplicate is often the dormant one,
 * and switching an account off is reversible, so the kept member's own state stays as it was. Never a deleted member
 * (`already_erased`): its personal data was removed on purpose, and a merge would hang a live person's history on
 * "Deleted Member", or the deleted person's on a live one.
 */
class DuplicatesController extends Controller
{
    /** Pairs at most on the page. */
    public const LIMIT = 100;

    public function index(Request $request, MemberMergeService $merger): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $orgId = (int) app('current_organization_id');

        $pairs = [];
        foreach ($merger->findDuplicates(self::LIMIT * 2, $orgId) as $found) {
            $keep = (int) $found['winner']->id;
            $other = (int) $found['loser']->id;
            $key = min($keep, $other) . '-' . max($keep, $other);
            $pairs[$key] ??= ['keep' => $keep, 'ids' => [$keep, $other]];
        }
        $pairs = array_slice($pairs, 0, self::LIMIT, true);

        $ids = collect($pairs)->pluck('ids')->flatten()->unique()->values()->all();
        $members = LoyaltyMember::query()->with('user')->whereIn('id', $ids)->get()->keyBy('id');

        $out = [];
        foreach ($pairs as $pair) {
            [$aId, $bId] = $pair['ids'];
            $a = $members[$aId] ?? null;
            $b = $members[$bId] ?? null;
            if (!$a || !$b || MemberErasure::isErased($a) || MemberErasure::isErased($b)) {
                continue;
            }
            $out[] = ['a' => MemberDirectory::row($a), 'b' => MemberDirectory::row($b), 'reasons' => self::reasons($a, $b), 'keep' => $pair['keep']];
        }

        return response()->json(['pairs' => $out]);
    }

    public function merge(Request $request, MemberMergeService $merger): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate([
            'keep_id'  => 'required|integer',
            'merge_id' => 'required|integer|different:keep_id',
            'reason'   => 'required|string|min:2|max:500',
        ]);
        $keep = LoyaltyMember::query()->with('user')->find($data['keep_id']) ?? throw LoyaltyRefused::notFound();
        $gone = LoyaltyMember::query()->with('user')->find($data['merge_id']) ?? throw LoyaltyRefused::notFound();
        if (MemberErasure::isErased($keep) || MemberErasure::isErased($gone)) {
            throw new LoyaltyRefused('already_erased', 'A deleted member cannot be merged.', 409);
        }

        $merger->merge($keep, $gone, $request->user()->id, trim($data['reason']));

        return response()->json(['member' => MemberProfile::of($keep->fresh(['user']))]);
    }

    /** Why two members look like one person: the same email (in any case), the same phone (by its digits). @return list<string> */
    private static function reasons(LoyaltyMember $a, LoyaltyMember $b): array
    {
        $email = fn (LoyaltyMember $m) => mb_strtolower(trim((string) $m->user?->email));
        $phone = fn (LoyaltyMember $m) => preg_replace('/\D+/', '', (string) $m->user?->phone) ?? '';

        $reasons = [];
        if ($email($a) !== '' && $email($a) === $email($b)) {
            $reasons[] = 'same_email';
        }
        if (strlen($phone($a)) >= 7 && $phone($a) === $phone($b)) {
            $reasons[] = 'same_phone';
        }

        return $reasons;
    }
}
