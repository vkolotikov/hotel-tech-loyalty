<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\AvailabilityService;
use Illuminate\Console\Command;

/**
 * Render the booking widget's view of availability + pricing for a given
 * org and date range, without having to click through the UI.
 *
 * Surfaces three things in one pass:
 *  1. The per-day calendar (price + sold-out flag) the widget paints on
 *     its date picker — confirms the gray-out logic is working.
 *  2. The per-room quote the widget shows on the room-select step,
 *     including Smoobu's length-of-stay discount overlay (raw_total vs
 *     price + discount_amount delta).
 *  3. Per-room inventory state (booked count vs inventory_count) so we
 *     can see WHY a room is sold out when one is.
 *
 * Read-only — no DB writes, no external state changes. Hits Smoobu's
 * /rates + /booking/checkApartmentAvailability via SmoobuClient.
 *
 * Usage:
 *   php artisan diag:widget-availability --org=12 --check-in=2026-06-01 --check-out=2026-06-08
 *   php artisan diag:widget-availability --org=12 --check-in=2026-06-01 --check-out=2026-06-08 --adults=4
 */
class DiagWidgetAvailability extends Command
{
    protected $signature = 'diag:widget-availability
                            {--org= : Organization id (required)}
                            {--check-in= : Y-m-d arrival date (required)}
                            {--check-out= : Y-m-d departure date (required)}
                            {--adults=2 : Adult count}
                            {--children=0 : Child count}';

    protected $description = 'Render the booking widget\'s availability + pricing snapshot for triage';

    public function handle(AvailabilityService $availability): int
    {
        $orgId = (int) $this->option('org');
        $in    = (string) $this->option('check-in');
        $out   = (string) $this->option('check-out');
        $ad    = max(1, (int) $this->option('adults'));
        $ch    = max(0, (int) $this->option('children'));

        if (!$orgId || !$in || !$out) {
            $this->error('--org, --check-in, --check-out are required.');
            return self::FAILURE;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $in) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $out)) {
            $this->error('Dates must be Y-m-d.');
            return self::FAILURE;
        }
        if ($in >= $out) {
            $this->error('--check-in must be before --check-out.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant scope the same way TenantMiddleware does at request
        // time — SmoobuClient credential lookup + booking_mirror queries
        // both rely on it being set.
        app()->instance('current_organization_id', $orgId);

        $nights = max(1, (int) ((strtotime($out) - strtotime($in)) / 86400));
        $this->info("Org {$orgId} ({$org->name})  {$in} → {$out}  ({$nights} night" . ($nights === 1 ? '' : 's') . ", {$ad} adult" . ($ad === 1 ? '' : 's') . ($ch ? ", {$ch} child" . ($ch === 1 ? '' : 'ren') : '') . ')');
        $this->newLine();

        // ── 1. Calendar (per-day cheapest + availability) ─────────────
        $this->line('<options=bold>1. Calendar prices for the requested window</>');
        try {
            $cal = $availability->calendarPrices($in, $out);
            $prices = $cal['prices'] ?? [];
            $avail  = $cal['availability'] ?? [];
            if (empty($prices)) {
                $this->warn('  (no calendar data — rooms not configured or Smoobu returned nothing)');
            } else {
                $start = new \DateTime($in);
                $endDt = new \DateTime($out);
                while ($start < $endDt) {
                    $d = $start->format('Y-m-d');
                    $price = $prices[$d] ?? null;
                    $isAvail = $avail[$d] ?? true;
                    $tag = $isAvail ? '<fg=green>OK  </>' : '<fg=red>SOLD</>';
                    $priceStr = $price !== null ? number_format((float) $price, 2) : '   —  ';
                    $this->line("  {$tag}  {$d}  {$priceStr}");
                    $start->modify('+1 day');
                }
            }
        } catch (\Throwable $e) {
            $this->error('  calendar lookup threw: ' . $e->getMessage());
        }
        $this->newLine();

        // ── 2. Available rooms with quote ─────────────────────────────
        $this->line('<options=bold>2. Available rooms for the requested window</>');
        try {
            $rooms = $availability->check($in, $out, $ad, $ch);
            if (empty($rooms)) {
                $this->warn('  (no rooms available — every unit either sold out, undersized, or no data)');
            } else {
                foreach ($rooms as $r) {
                    $this->line(sprintf(
                        '  <fg=cyan>%s</>  %s  %.2f %s  (%s/night, min %d)',
                        str_pad((string) $r['id'], 6),
                        str_pad(substr($r['name'] ?? '?', 0, 40), 40),
                        (float) ($r['total_price'] ?? 0),
                        $r['currency'] ?? 'EUR',
                        number_format((float) ($r['price_per_night'] ?? 0), 2),
                        (int) ($r['min_stay'] ?? 1),
                    ));
                }
            }
        } catch (\Throwable $e) {
            $this->error('  rooms lookup threw: ' . $e->getMessage());
        }
        $this->newLine();

        // ── 3. Per-unit rate with discount overlay ────────────────────
        $this->line('<options=bold>3. Per-unit Smoobu calculated total (discount overlay)</>');
        $unitIds = array_map(fn($r) => (string) ($r['id'] ?? ''), $rooms ?? []);
        if (empty($unitIds)) {
            $this->warn('  (skipped — no rooms came back from step 2)');
        } else {
            foreach ($unitIds as $uid) {
                try {
                    $rate = $availability->unitRates($uid, $in, $out, $ad);
                    if (empty($rate)) {
                        $this->line("  <fg=yellow>{$uid}</>  no rate (sold out or no data)");
                        continue;
                    }
                    $hasDiscount = isset($rate['discount_amount']) && (float) $rate['discount_amount'] > 0;
                    $tag = $hasDiscount ? '<fg=green>DISCOUNT</>' : '<fg=gray>no disc.</>';
                    $line = sprintf(
                        '  %s  %s  total=%.2f %s',
                        $tag,
                        str_pad($uid, 6),
                        (float) ($rate['price'] ?? 0),
                        $rate['currency'] ?? 'EUR',
                    );
                    if ($hasDiscount) {
                        $line .= sprintf(
                            '  (raw=%.2f, saved=%.2f)',
                            (float) ($rate['raw_total'] ?? 0),
                            (float) $rate['discount_amount'],
                        );
                    }
                    $this->line($line);
                } catch (\Throwable $e) {
                    $this->error("  {$uid}  threw: " . $e->getMessage());
                }
            }
        }
        $this->newLine();

        // ── 4. Inventory snapshot (booked vs total) ───────────────────
        $this->line('<options=bold>4. Inventory state (booked vs total for the window)</>');
        $allRooms = \App\Models\BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->get(['id', 'pms_id', 'name', 'inventory_count']);
        if ($allRooms->isEmpty()) {
            $this->warn('  (no rooms configured for this org)');
        } else {
            foreach ($allRooms as $room) {
                $pms = (string) ($room->pms_id ?? '');
                if ($pms === '') continue;
                $booked = \App\Models\BookingMirror::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('apartment_id', $pms)
                    ->where('booking_state', '!=', 'cancelled')
                    ->where('arrival_date', '<', $out)
                    ->where('departure_date', '>', $in)
                    ->count();
                $inv = max(1, (int) ($room->inventory_count ?? 1));
                $tag = $booked >= $inv ? '<fg=red>SOLD OUT</>' : '<fg=green>AVAIL   </>';
                $this->line(sprintf(
                    '  %s  pms=%-6s %s  booked=%d/%d',
                    $tag,
                    $pms,
                    str_pad(substr($room->name ?? '?', 0, 40), 40),
                    $booked,
                    $inv,
                ));
            }
        }
        $this->newLine();

        $this->info('Done.');
        return self::SUCCESS;
    }
}
