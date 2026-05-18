<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CorporateAccount;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Cmd+K global search across the CRM. Hits guests / inquiries / corporate
 * accounts / reservations / loyalty members in a single round-trip.
 *
 * Per-source result cap is intentionally small (5 each by default) — the
 * modal is for "jump-to-anything", not bulk results. Staff who need full
 * lists use the dedicated /customers, /inquiries, /bookings pages.
 *
 * All queries respect TenantScope via the underlying models so cross-org
 * leakage is impossible by construction.
 */
class GlobalSearchController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['results' => []]);
        }

        $perType = (int) $request->get('limit', 5);
        $perType = max(1, min(15, $perType));

        $like = '%' . $q . '%';
        $results = [];

        // Customers (CRM guests)
        $guests = Guest::where(function ($qq) use ($like) {
                $qq->where('full_name', 'ilike', $like)
                    ->orWhere('email', 'ilike', $like)
                    ->orWhere('phone', 'ilike', $like)
                    ->orWhere('company', 'ilike', $like);
            })
            ->orderByDesc('last_activity_at')
            ->limit($perType)
            ->get(['id', 'full_name', 'email', 'phone', 'company', 'vip_level', 'member_id']);

        foreach ($guests as $g) {
            $results[] = [
                'type'    => 'customer',
                'id'      => $g->id,
                'title'   => $g->full_name ?: ($g->email ?: 'Untitled customer'),
                'subtitle'=> $this->stitch([$g->email, $g->company]),
                'badge'   => $g->vip_level && $g->vip_level !== 'Standard' ? 'VIP' : null,
                'url'     => "/guests/{$g->id}",
            ];
        }

        // Inquiries — by id, guest name, or notes
        $inquiries = Inquiry::with('guest:id,full_name,company')
            ->where(function ($qq) use ($like, $q) {
                $qq->where('notes', 'ilike', $like)
                    ->orWhere('special_requests', 'ilike', $like)
                    ->orWhereHas('guest', function ($g) use ($like) {
                        $g->where('full_name', 'ilike', $like)->orWhere('company', 'ilike', $like);
                    });
                if (ctype_digit($q)) {
                    $qq->orWhere('id', (int) $q);
                }
            })
            ->orderByDesc('updated_at')
            ->limit($perType)
            ->get();

        foreach ($inquiries as $inq) {
            $results[] = [
                'type'    => 'inquiry',
                'id'      => $inq->id,
                'title'   => '#' . $inq->id . ' · ' . ($inq->guest?->full_name ?? 'No contact'),
                'subtitle'=> $this->stitch([$inq->status, $inq->inquiry_type, $inq->total_value ? '$' . number_format((float) $inq->total_value) : null]),
                'badge'   => $inq->priority,
                'url'     => "/inquiries/{$inq->id}",
            ];
        }

        // Corporate accounts
        $companies = CorporateAccount::where('company_name', 'ilike', $like)
            ->orderByDesc('updated_at')
            ->limit($perType)
            ->get(['id', 'company_name', 'industry', 'contact_person', 'status']);

        foreach ($companies as $c) {
            $results[] = [
                'type'    => 'company',
                'id'      => $c->id,
                'title'   => $c->company_name,
                'subtitle'=> $this->stitch([$c->industry, $c->contact_person]),
                'badge'   => $c->status,
                'url'     => '/corporate?focus=' . $c->id,
            ];
        }

        // Reservations — by confirmation number or guest name
        $reservations = Reservation::with('guest:id,full_name')
            ->where(function ($qq) use ($like, $q) {
                $qq->where('confirmation_no', 'ilike', $like)
                    ->orWhereHas('guest', fn ($g) => $g->where('full_name', 'ilike', $like));
                if (ctype_digit($q)) {
                    $qq->orWhere('id', (int) $q);
                }
            })
            ->orderByDesc('check_in')
            ->limit($perType)
            ->get();

        foreach ($reservations as $r) {
            $results[] = [
                'type'    => 'reservation',
                'id'      => $r->id,
                'title'   => ($r->confirmation_no ?: '#' . $r->id) . ' · ' . ($r->guest?->full_name ?? 'No guest'),
                'subtitle'=> $this->stitch([$r->check_in, $r->room_type, $r->status]),
                'badge'   => $r->payment_status,
                'url'     => "/bookings/{$r->id}",
            ];
        }

        // Loyalty members — search by their user name/email/phone via a join
        // so admins can find a member even when the linked guest hasn't been
        // populated yet.
        $memberUserIds = User::where('user_type', 'member')
            ->where(function ($qq) use ($like) {
                $qq->where('name', 'ilike', $like)
                    ->orWhere('email', 'ilike', $like)
                    ->orWhere('phone', 'ilike', $like);
            })
            ->limit($perType * 2)
            ->pluck('id');

        if ($memberUserIds->isNotEmpty()) {
            $members = LoyaltyMember::with('user:id,name,email,phone')
                ->whereIn('user_id', $memberUserIds)
                ->orderByDesc('last_activity_at')
                ->limit($perType)
                ->get();

            foreach ($members as $m) {
                $results[] = [
                    'type'    => 'member',
                    'id'      => $m->id,
                    'title'   => $m->user?->name ?: ($m->user?->email ?: ('#' . $m->member_number)),
                    'subtitle'=> $this->stitch([$m->member_number, $m->user?->email]),
                    'badge'   => $m->current_points ? $m->current_points . ' pts' : null,
                    'url'     => "/members/{$m->id}",
                ];
            }
        }

        return response()->json(['results' => $results]);
    }

    private function stitch(array $parts): string
    {
        return implode(' · ', array_filter(array_map(fn ($p) => $p === null || $p === '' ? null : (string) $p, $parts)));
    }
}
