<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\MemberDirectory;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The members list as a CSV file (spec 2026-10-21 release 2 §4.2), a manager's: personal data leaving the system.
 * The filters are the list's own (`q`, `tier_id`, `state`, `sort`, read as `GET members` reads them) and the rows come
 * from the same query (MemberDirectory::filtered), so the file holds what the screen showed, in its order. UTF-8 with
 * a byte-order mark, so Excel shows accents; days on the venue's clock. Every export is audited
 * (`loyalty.members_exported`, with the filters and the number of rows).
 *
 * A cell that would start a spreadsheet formula (`=`, `+`, `-`, `@`, a tab or a return) is written with a leading
 * apostrophe, unless it is plainly a number or a phone number ("+371 26 123 456").
 */
class ExportController extends Controller
{
    public const COLUMNS = ['Name', 'Email', 'Phone', 'Member number', 'Tier', 'Points', 'Lifetime points', 'Joined', 'Last activity', 'Active', 'Marketing consent'];

    public function members(Request $request, MemberDirectory $directory): StreamedResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $orgId = (int) app('current_organization_id');
        $filters = [
            'q'       => mb_substr((string) $request->query('q', ''), 0, 100),
            'tier_id' => $request->filled('tier_id') ? (int) $request->query('tier_id') : null,
            'state'   => $request->query('state'),
            'sort'    => $request->query('sort'),
        ];
        $query = $directory->filtered($filters);
        $count = (clone $query)->count();

        AuditLog::record('loyalty.members_exported', null, ['filters' => array_filter($filters, fn ($v) => $v !== null && $v !== ''), 'rows' => $count],
            [], $request->user(), "Members exported: {$count} rows");

        $tiers = LoyaltyTier::query()->pluck('name', 'id');
        $zone = VenueClock::zone($orgId);
        $day = fn (?CarbonInterface $at) => $at?->copy()->setTimezone($zone)->toDateString();

        return response()->streamDownload(function () use ($query, $tiers, $day) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, self::COLUMNS, ',', '"', '');
            $query->chunk(500, function ($rows) use ($out, $tiers, $day) {
                foreach ($rows as $m) {
                    /** @var LoyaltyMember $m */
                    fputcsv($out, array_map([self::class, 'cell'], [
                        $m->user_name,
                        $m->user_email,
                        $m->user_phone,
                        $m->member_number,
                        $m->tier_id !== null ? ($tiers[$m->tier_id] ?? '') : '',
                        (int) $m->current_points,
                        (int) $m->lifetime_points,
                        $day($m->joined_at ?? $m->created_at),
                        $day($m->last_activity_at),
                        $m->is_active ? 'yes' : 'no',
                        $m->marketing_consent ? 'yes' : 'no',
                    ]), ',', '"', '');
                }
            });
            fclose($out);
        }, 'members-' . VenueClock::today($orgId) . '.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** A value as a CSV cell, never a formula a spreadsheet would run. */
    public static function cell(mixed $value): string
    {
        $text = (string) ($value ?? '');
        if ($text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) && !preg_match('/^[+\-]?[0-9][0-9 ().\-\/]*$/', $text)) {
            return "'" . $text;
        }

        return $text;
    }
}
