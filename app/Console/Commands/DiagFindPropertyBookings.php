<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\BookingSubmission;
use App\Models\Organization;
use App\Models\SmoobuWebhookEvent;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Where did this guest's booking actually land?"
 *
 * Resolves an org from an owner email, binds tenant context, then searches
 * every booking-adjacent storage table for any record mentioning the guest.
 * Output is one unified table so support can answer "did the booking get
 * created?" / "did it reach Smoobu?" / "where did the webhook event end up?"
 * in a single shell command.
 *
 * Each search section is wrapped in try/catch — a single missing table or
 * column doesn't kill the rest of the run.
 *
 * Usage:
 *   php artisan diag:find-property-bookings --owner-email=hotel@example.com --guest="John Smith"
 *   php artisan diag:find-property-bookings --owner-email=… --guest=… --from=2026-05-01 --to=2026-05-31
 *   php artisan diag:find-property-bookings --owner-email=… --guest=… --org-id=12 --json
 */
class DiagFindPropertyBookings extends Command
{
    protected $signature = 'diag:find-property-bookings
                            {--owner-email= : Owner email to resolve the org from}
                            {--guest= : Guest name or email substring (ILIKE)}
                            {--from= : Filter check-in/check-out >= this date (Y-m-d)}
                            {--to= : Filter check-in/check-out <= this date (Y-m-d)}
                            {--org-id= : Override org resolution when --owner-email is ambiguous}
                            {--json : Emit machine-readable JSON instead of a table}';

    protected $description = 'Cross-table search for a specific customer\'s booking records (mirror + submissions + webhook + audit).';

    public function handle(): int
    {
        $ownerEmail = $this->option('owner-email');
        if (!$ownerEmail) {
            $this->error('--owner-email=EMAIL is required.');
            return self::FAILURE;
        }

        $guest = (string) ($this->option('guest') ?? '');
        $from  = $this->option('from');
        $to    = $this->option('to');

        $orgId = $this->resolveOrgId($ownerEmail);
        if ($orgId === false) {
            return self::FAILURE;
        }

        // Bind tenant the same way TenantMiddleware would.
        app()->instance('current_organization_id', $orgId);

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization #{$orgId} not found.");
            return self::FAILURE;
        }

        $results = [];

        $results['booking_mirror']        = $this->searchBookingMirror($orgId, $guest, $from, $to);
        $results['booking_submissions']   = $this->searchBookingSubmissions($orgId, $guest, $from, $to);
        $results['smoobu_webhook_events'] = $this->searchSmoobuWebhookEvents($orgId, $guest);
        $results['audit_logs']            = $this->searchAuditLogs($orgId, $guest);

        if ($this->option('json')) {
            $this->line(json_encode([
                'org_id'   => $orgId,
                'org_name' => $org->name,
                'guest'    => $guest,
                'from'     => $from,
                'to'       => $to,
                'results'  => $results,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return self::SUCCESS;
        }

        $this->renderTable($org, $guest, $from, $to, $results);
        return self::SUCCESS;
    }

    private function resolveOrgId(string $ownerEmail): int|false
    {
        if ($override = $this->option('org-id')) {
            return (int) $override;
        }

        $users = User::query()
            ->where('email', $ownerEmail)
            ->whereNotNull('organization_id')
            ->get(['id', 'organization_id', 'name', 'user_type']);

        if ($users->isEmpty()) {
            $this->error("No user with email {$ownerEmail}. Pass --org-id=ID directly.");
            return false;
        }

        $orgIds = $users->pluck('organization_id')->unique()->values();
        if ($orgIds->count() > 1) {
            $this->error('Email is in multiple orgs: ' . $orgIds->implode(', ') . '. Pass --org-id=ID to pick one.');
            return false;
        }

        return (int) $orgIds->first();
    }

    private function searchBookingMirror(int $orgId, string $guest, ?string $from, ?string $to): array
    {
        try {
            $q = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId);

            if ($guest !== '') {
                $q->where(function ($qq) use ($guest) {
                    $qq->where('guest_name', 'ILIKE', "%{$guest}%")
                       ->orWhere('guest_email', 'ILIKE', "%{$guest}%");
                });
            }
            if ($from) {
                $q->where(function ($qq) use ($from) {
                    $qq->where('arrival_date', '>=', $from)
                       ->orWhere('departure_date', '>=', $from);
                });
            }
            if ($to) {
                $q->where(function ($qq) use ($to) {
                    $qq->where('arrival_date', '<=', $to)
                       ->orWhere('departure_date', '<=', $to);
                });
            }

            $rows = $q->orderByDesc('id')->limit(50)->get();

            return $rows->map(fn ($r) => [
                'table'           => 'booking_mirror',
                'id'              => (int) $r->id,
                'reservation_id'  => (string) ($r->reservation_id ?? ''),
                'guest_name'      => (string) ($r->guest_name ?? ''),
                'guest_email'     => (string) ($r->guest_email ?? ''),
                'check_in'        => (string) ($r->arrival_date ?? ''),
                'check_out'       => (string) ($r->departure_date ?? ''),
                'payment_status'  => (string) ($r->payment_status ?? ''),
                'internal_status' => (string) ($r->internal_status ?? ''),
                'brand_id'        => $r->brand_id ?? null,
                'created_at'      => (string) ($r->created_at ?? ''),
            ])->all();
        } catch (\Throwable $e) {
            return [['error' => mb_substr($e->getMessage(), 0, 300)]];
        }
    }

    private function searchBookingSubmissions(int $orgId, string $guest, ?string $from, ?string $to): array
    {
        try {
            if (!Schema::hasTable('booking_submissions')) {
                return [];
            }
            $q = BookingSubmission::withoutGlobalScopes()
                ->where('organization_id', $orgId);

            if ($guest !== '') {
                $q->where(function ($qq) use ($guest) {
                    $qq->where('guest_name', 'ILIKE', "%{$guest}%")
                       ->orWhere('guest_email', 'ILIKE', "%{$guest}%");
                });
            }
            if ($from) {
                $q->where(function ($qq) use ($from) {
                    $qq->where('check_in', '>=', $from)
                       ->orWhere('check_out', '>=', $from);
                });
            }
            if ($to) {
                $q->where(function ($qq) use ($to) {
                    $qq->where('check_in', '<=', $to)
                       ->orWhere('check_out', '<=', $to);
                });
            }

            $rows = $q->orderByDesc('id')->limit(50)->get();

            return $rows->map(fn ($r) => [
                'table'           => 'booking_submissions',
                'id'              => (int) $r->id,
                'reservation_id'  => (string) ($r->reservation_id ?? ''),
                'guest_name'      => (string) ($r->guest_name ?? ''),
                'guest_email'     => (string) ($r->guest_email ?? ''),
                'check_in'        => (string) ($r->check_in ?? ''),
                'check_out'       => (string) ($r->check_out ?? ''),
                'payment_status'  => (string) ($r->payment_status ?? ''),
                'internal_status' => (string) ($r->outcome ?? ''),
                'brand_id'        => $r->brand_id ?? null,
                'created_at'      => (string) ($r->created_at ?? ''),
            ])->all();
        } catch (\Throwable $e) {
            return [['error' => mb_substr($e->getMessage(), 0, 300)]];
        }
    }

    /**
     * Webhook events are deduped by body_hash; we don't store the full
     * body. Match on stored top-level columns (reservation_id, action)
     * + a fallback to recent rows for the org so support can correlate
     * by timestamp. Limited to last 30 days.
     */
    private function searchSmoobuWebhookEvents(int $orgId, string $guest): array
    {
        try {
            if (!Schema::hasTable('smoobu_webhook_events')) {
                return [];
            }
            $q = SmoobuWebhookEvent::query()
                ->where('organization_id', $orgId)
                ->where('received_at', '>=', now()->subDays(30))
                ->orderByDesc('id')
                ->limit(50);

            if ($guest !== '' && is_numeric($guest)) {
                // Numeric guest input is probably a reservation id.
                $q->where('reservation_id', $guest);
            }

            $rows = $q->get(['id', 'action', 'reservation_id', 'received_at']);

            return $rows->map(fn ($r) => [
                'table'           => 'smoobu_webhook_events',
                'id'              => (int) $r->id,
                'reservation_id'  => (string) ($r->reservation_id ?? ''),
                'guest_name'      => '',
                'guest_email'     => '',
                'check_in'        => '',
                'check_out'       => '',
                'payment_status'  => '',
                'internal_status' => (string) ($r->action ?? ''),
                'brand_id'        => null,
                'created_at'      => (string) ($r->received_at ?? ''),
            ])->all();
        } catch (\Throwable $e) {
            return [['error' => mb_substr($e->getMessage(), 0, 300)]];
        }
    }

    private function searchAuditLogs(int $orgId, string $guest): array
    {
        try {
            $q = AuditLog::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('created_at', '>=', now()->subDays(30));

            if ($guest !== '') {
                $q->where(function ($qq) use ($guest) {
                    $qq->where('description', 'ILIKE', "%{$guest}%")
                       ->orWhere('action', 'ILIKE', "%{$guest}%");
                });
            }

            $rows = $q->orderByDesc('id')
                ->limit(50)
                ->get(['id', 'action', 'description', 'subject_type', 'subject_id', 'created_at']);

            return $rows->map(fn ($r) => [
                'table'           => 'audit_logs',
                'id'              => (int) $r->id,
                'reservation_id'  => (string) ($r->subject_id ?? ''),
                'guest_name'      => '',
                'guest_email'     => '',
                'check_in'        => '',
                'check_out'       => '',
                'payment_status'  => '',
                'internal_status' => (string) ($r->action ?? ''),
                'brand_id'        => null,
                'created_at'      => (string) ($r->created_at ?? ''),
                'description'     => mb_substr((string) ($r->description ?? ''), 0, 200),
            ])->all();
        } catch (\Throwable $e) {
            return [['error' => mb_substr($e->getMessage(), 0, 300)]];
        }
    }

    private function renderTable(Organization $org, string $guest, ?string $from, ?string $to, array $results): void
    {
        $this->line(sprintf(
            '<info>Org:</info> #%d %s — searching for guest "%s" %s%s',
            $org->id,
            $org->name,
            $guest ?: '(any)',
            $from ? " from {$from}" : '',
            $to ? " to {$to}" : '',
        ));
        $this->newLine();

        $flat = [];
        foreach ($results as $tableName => $rows) {
            foreach ($rows as $row) {
                if (isset($row['error'])) {
                    $this->warn("Search of {$tableName} failed: " . $row['error']);
                    continue;
                }
                $flat[] = $row;
            }
        }

        if (empty($flat)) {
            $this->warn('No matches found in any table.');
            return;
        }

        $tableRows = array_map(function ($r) {
            return [
                $r['table'],
                $r['id'],
                mb_substr($r['guest_name'] ?: '—', 0, 30),
                mb_substr($r['guest_email'] ?: '—', 0, 30),
                $r['check_in'] ?: '—',
                $r['check_out'] ?: '—',
                $r['payment_status'] ?: '—',
                mb_substr($r['internal_status'] ?: '—', 0, 24),
                $r['reservation_id'] ?: '—',
                $r['brand_id'] !== null ? (string) $r['brand_id'] : '—',
                $r['created_at'] ?: '—',
            ];
        }, $flat);

        $this->table(
            ['Table', 'ID', 'Guest', 'Email', 'CheckIn', 'CheckOut', 'Pay', 'Status/Action', 'ReservationID', 'Brand', 'Created'],
            $tableRows
        );

        $this->newLine();
        $counts = [];
        foreach ($results as $name => $rows) {
            $counts[$name] = count(array_filter($rows, fn ($r) => !isset($r['error'])));
        }
        $this->info('Totals: ' . collect($counts)->map(fn ($n, $t) => "{$t}={$n}")->implode('  '));
    }
}
