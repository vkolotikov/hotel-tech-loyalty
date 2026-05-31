<?php

namespace App\Console\Commands;

use App\Models\BookingHold;
use App\Models\Organization;
use App\Scopes\TenantScope;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Tinker-equivalent for inspecting a single BookingHold row, with a
 * special focus on payload_json type information. Built because raw
 * `php artisan tinker` invocations get awkward fast on Windows shells
 * (escaping, quoting, no `var_dump` formatting) and we keep hitting
 * subtle bugs where payload_json fields are persisted as strings but
 * compared against ints (or vice versa).
 *
 * The specific motivating case: `unit_id` was suspected of being stored
 * as a string `"2120861"` when downstream code (Smoobu apartmentId
 * binding, BookingRoom::where('pms_id', ...) lookups, in-array checks)
 * was treating it as an int. A single mismatched type causes silent
 * "no matching room" results that surface only on the confirm path.
 *
 * Output:
 *   1. BookingHold row metadata — id, token, status, expires_at,
 *      consumed_at (if column exists).
 *   2. payload_json full pretty-print + per-field type column
 *      (var_dump-style: int(123), string(7) "2120861", NULL, array(3)).
 *   3. Special highlight on unit_id / unit_ids[] type info.
 *   4. Linked Stripe PaymentIntent status, when the hold's payload or
 *      metadata carries one (best-effort; no API call when no token).
 *
 * Read-only. Safe on prod.
 *
 * Usage:
 *   php artisan diag:hold-inspect hld_abc123 --org=42
 *   php artisan diag:hold-inspect 7891 --org=42
 *   php artisan diag:hold-inspect hld_abc123                   # cross-tenant lookup
 */
class DiagHoldInspect extends Command
{
    protected $signature = 'diag:hold-inspect
                            {hold_token_or_id : BookingHold.hold_token OR primary key id}
                            {--org= : Organization id (optional; widens search when set)}';

    protected $description = 'Dump a BookingHold row with var_dump-style per-field type info on payload_json.';

    public function handle(StripeService $stripe): int
    {
        $needle = (string) $this->argument('hold_token_or_id');
        $orgId = $this->option('org') !== null ? (int) $this->option('org') : null;

        if ($needle === '') {
            $this->error('hold_token_or_id is required.');
            return self::FAILURE;
        }

        // Resolve org (optional). When given, bind it so any downstream
        // service that reads current_organization_id picks it up; either
        // way we scope queries with withoutGlobalScopes() so a missing
        // tenant binding can never return zero rows.
        if ($orgId) {
            $org = Organization::find($orgId);
            if (!$org) {
                $this->error("Organization {$orgId} not found.");
                return self::FAILURE;
            }
            app()->instance('current_organization_id', $orgId);
        }

        // Locate the hold. Try hold_token first (the common case — pi
        // metadata, frontend state, Stripe Dashboard all carry the
        // token). Fall back to numeric primary key when the token lookup
        // misses. Always cross-tenant unless --org is given.
        $query = BookingHold::withoutGlobalScope(TenantScope::class);
        if ($orgId) {
            $query->where('organization_id', $orgId);
        }

        $hold = (clone $query)->where('hold_token', $needle)->first();
        if (!$hold && ctype_digit($needle)) {
            $hold = (clone $query)->where('id', (int) $needle)->first();
        }

        if (!$hold) {
            $this->error("No BookingHold matched '{$needle}'"
                . ($orgId ? " in org {$orgId}." : ' (searched across all orgs).'));
            return self::FAILURE;
        }

        // ── 1. Hold row metadata ─────────────────────────────────────
        $this->info('═══ BookingHold ═══');

        $consumedAt = null;
        if (\Schema::hasColumn('booking_holds', 'consumed_at')) {
            $consumedAt = $hold->consumed_at ?? null;
            if ($consumedAt && !is_string($consumedAt)) {
                $consumedAt = (string) $consumedAt;
            }
        }

        $this->table(['Field', 'Value'], [
            ['id',              (string) $hold->id],
            ['hold_token',      (string) ($hold->hold_token ?? '—')],
            ['organization_id', (string) ($hold->organization_id ?? '—')],
            ['status',          $this->colorStatus((string) ($hold->status ?? ''))],
            ['expires_at',      $hold->expires_at?->toDateTimeString() ?? '—'],
            ['expires_in',      $this->describeExpiry($hold)],
            ['consumed_at',     $consumedAt ?: (\Schema::hasColumn('booking_holds', 'consumed_at') ? '—' : '(column absent)')],
            ['created_at',      $hold->created_at?->toDateTimeString() ?? '—'],
            ['updated_at',      $hold->updated_at?->toDateTimeString() ?? '—'],
        ]);

        // ── 2. payload_json — pretty print + per-field type ──────────
        $payload = $hold->payload_json;

        $this->newLine();
        $this->info('═══ payload_json (pretty) ═══');
        if ($payload === null) {
            $this->warn('payload_json is NULL.');
        } elseif (!is_array($payload)) {
            $this->warn('payload_json cast did not return an array: ' . gettype($payload));
            $this->line(var_export($payload, true));
        } else {
            $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }

        $this->newLine();
        $this->info('═══ payload_json (per-field type, var_dump-style) ═══');
        if (is_array($payload) && !empty($payload)) {
            $rows = [];
            foreach ($payload as $key => $value) {
                $rows[] = [(string) $key, $this->typeOf($value), $this->preview($value)];
            }
            $this->table(['Field', 'Type', 'Preview'], $rows);
        } else {
            $this->line('— no fields to dump —');
        }

        // ── 3. Special highlight: unit_id / unit_ids[] type info ─────
        $this->newLine();
        $this->info('═══ unit_id type drill-down ═══');
        $this->highlightUnitId($payload);

        // ── 4. Linked PaymentIntent status ───────────────────────────
        $piId = $this->resolvePaymentIntentId($payload);
        $this->newLine();
        $this->info('═══ Linked PaymentIntent ═══');
        if (!$piId) {
            $this->line('No payment_intent / payment_intent_id field on the payload — nothing to look up.');
        } else {
            $this->table(['Field', 'Value'], [
                ['payment_intent', $piId],
                ['type',           $this->typeOf($piId)],
            ]);
            $this->newLine();
            if (!$orgId) {
                $this->warn('--org=<id> not provided — skipping Stripe lookup (StripeService needs tenant context for the secret key).');
            } elseif (!$stripe->isEnabled()) {
                $this->warn("Stripe is not configured / not enabled for org {$orgId}.");
            } else {
                try {
                    $pi = $stripe->retrievePaymentIntent($piId);
                    $this->table(['PI field', 'Value'], [
                        ['id',          (string) ($pi->id ?? '—')],
                        ['status',      $this->colorStatus((string) ($pi->status ?? ''))],
                        ['amount',      isset($pi->amount) ? (string) $pi->amount : '—'],
                        ['amount_major', isset($pi->amount) ? number_format(((int) $pi->amount) / 100, 2) : '—'],
                        ['currency',    strtoupper((string) ($pi->currency ?? ''))],
                        ['created',     isset($pi->created) ? date('c', (int) $pi->created) : '—'],
                        ['client_secret_present', !empty($pi->client_secret) ? 'yes' : 'no'],
                    ]);
                } catch (\Throwable $e) {
                    $this->warn('Stripe retrieve failed: ' . $e->getMessage());
                }
            }
        }

        return self::SUCCESS;
    }

    /**
     * Return a var_dump-style type label. Mirrors PHP's own conventions
     * so operators reading the output can pattern-match against tinker
     * output they've seen elsewhere.
     */
    private function typeOf(mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }
        if (is_bool($value)) {
            return 'bool(' . ($value ? 'true' : 'false') . ')';
        }
        if (is_int($value)) {
            return "int({$value})";
        }
        if (is_float($value)) {
            return "float({$value})";
        }
        if (is_string($value)) {
            $len = strlen($value);
            return "string({$len})";
        }
        if (is_array($value)) {
            $n = count($value);
            $isList = array_is_list($value);
            return ($isList ? 'list' : 'array') . "({$n})";
        }
        if (is_object($value)) {
            return 'object(' . $value::class . ')';
        }
        return gettype($value);
    }

    /**
     * One-line preview of a value. Strings get var_dump-style quoting,
     * arrays get a compact JSON head, everything else gets a short cast.
     */
    private function preview(mixed $value, int $max = 120): string
    {
        if ($value === null) {
            return 'NULL';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        if (is_string($value)) {
            $s = '"' . $value . '"';
            return strlen($s) > $max ? substr($s, 0, $max - 3) . '..."' : $s;
        }
        if (is_array($value)) {
            $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                return '[unencodable]';
            }
            return strlen($json) > $max ? substr($json, 0, $max - 3) . '...' : $json;
        }
        return gettype($value);
    }

    /**
     * Drill into the suspected-stringly-typed unit_id / unit_ids field.
     * Loud output: print type AND a normalised int form so the operator
     * can eyeball both side by side. If the field is missing entirely,
     * say so — that's also a useful signal.
     */
    private function highlightUnitId(mixed $payload): void
    {
        if (!is_array($payload)) {
            $this->line('No payload available.');
            return;
        }

        $hasUnitId = array_key_exists('unit_id', $payload);
        $hasUnitIds = array_key_exists('unit_ids', $payload);

        if (!$hasUnitId && !$hasUnitIds) {
            $this->line('Neither unit_id nor unit_ids present on payload_json.');
            return;
        }

        if ($hasUnitId) {
            $v = $payload['unit_id'];
            $coerced = is_numeric($v) ? (int) $v : null;
            $this->table(['Field', 'Type', 'Raw value', 'Cast to int'], [[
                'unit_id',
                $this->typeOf($v),
                $this->preview($v),
                $coerced === null ? '(non-numeric)' : (string) $coerced,
            ]]);

            if (is_string($v) && is_numeric($v)) {
                $this->warn('unit_id is STORED AS A STRING. Downstream code comparing with === on int will mismatch.');
            } elseif (is_int($v)) {
                $this->info('unit_id is stored as int.');
            }
        }

        if ($hasUnitIds) {
            $arr = $payload['unit_ids'];
            $this->line('unit_ids[] entries:');
            if (!is_array($arr)) {
                $this->warn('unit_ids is present but NOT an array: ' . $this->typeOf($arr));
                return;
            }
            $rows = [];
            foreach ($arr as $idx => $v) {
                $coerced = is_numeric($v) ? (int) $v : null;
                $rows[] = [
                    "[{$idx}]",
                    $this->typeOf($v),
                    $this->preview($v),
                    $coerced === null ? '(non-numeric)' : (string) $coerced,
                ];
            }
            $this->table(['Index', 'Type', 'Raw value', 'Cast to int'], $rows);

            $stringCount = count(array_filter($arr, fn ($v) => is_string($v) && is_numeric($v)));
            if ($stringCount > 0) {
                $this->warn("unit_ids has {$stringCount} numeric-string element(s) — same type-mismatch risk as scalar unit_id above.");
            }
        }
    }

    /**
     * Best-effort dig for a Stripe PaymentIntent id on the hold payload.
     * Known field names (in priority order) — pick the first non-empty
     * one. Returns null when nothing's found.
     */
    private function resolvePaymentIntentId(mixed $payload): ?string
    {
        if (!is_array($payload)) {
            return null;
        }
        foreach (['payment_intent', 'payment_intent_id', 'pi_id', 'stripe_payment_intent_id'] as $key) {
            if (!empty($payload[$key]) && is_string($payload[$key])) {
                return $payload[$key];
            }
        }
        return null;
    }

    private function describeExpiry(BookingHold $hold): string
    {
        if (!$hold->expires_at) {
            return '—';
        }
        $now = now();
        if ($hold->expires_at->isFuture()) {
            return 'in ' . $hold->expires_at->diffForHumans($now, true);
        }
        return $hold->expires_at->diffForHumans($now, true) . ' ago (EXPIRED)';
    }

    private function colorStatus(string $status): string
    {
        return match ($status) {
            'active'             => "<fg=green>{$status}</>",
            'consumed', 'used'   => "<fg=cyan>{$status}</>",
            'expired', 'cancelled', 'canceled' => "<fg=gray>{$status}</>",
            'succeeded'          => "<fg=green>{$status}</>",
            'requires_payment_method', 'requires_action', 'requires_confirmation', 'requires_capture'
                                 => "<fg=yellow>{$status}</>",
            ''                   => '—',
            default              => $status,
        };
    }
}
