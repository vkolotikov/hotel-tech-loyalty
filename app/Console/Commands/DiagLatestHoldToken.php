<?php

namespace App\Console\Commands;

use App\Models\BookingHold;
use Illuminate\Console\Command;

/**
 * Print JUST the most-recent BookingHold's token to stdout — nothing
 * else, no formatting, no trailing whitespace beyond the single newline
 * that `$this->line()` emits — so it can be plugged straight into
 * shell pipelines:
 *
 *   php artisan diag:confirm-replay $(php artisan diag:latest-hold-token --org=12) --org=12
 *   TOKEN=$(php artisan diag:latest-hold-token --org=12) && php artisan diag:hold-inspect "$TOKEN" --org=12
 *
 * Exits 1 when no matching hold exists (so `$()` expansion in a pipeline
 * surfaces the failure rather than silently substituting empty string).
 *
 * Read-only. Safe on prod.
 */
class DiagLatestHoldToken extends Command
{
    protected $signature = 'diag:latest-hold-token
                            {--org= : Organization id (optional; narrows the lookup when set)}';

    protected $description = 'Print the most-recent BookingHold.hold_token to stdout for shell pipe usage.';

    public function handle(): int
    {
        $orgId = $this->option('org') !== null ? (int) $this->option('org') : null;

        $query = BookingHold::withoutGlobalScopes();
        if ($orgId) {
            $query->where('organization_id', $orgId);
        }

        $hold = $query->orderByDesc('id')->first(['id', 'hold_token', 'organization_id']);

        if (!$hold || !$hold->hold_token) {
            // Write to stderr so stdout stays clean for the pipe consumer
            // — a `$()` substitution should expand to empty + a visible
            // error on the terminal, not pollute the command line.
            $this->getOutput()->getErrorStyle()->writeln(
                '<error>No BookingHold found'
                . ($orgId ? " in org {$orgId}." : ' (searched across all orgs).')
                . '</error>'
            );
            return self::FAILURE;
        }

        // Plain `line()` writes the token followed by a single newline.
        // That's exactly what shell command substitution wants.
        $this->line((string) $hold->hold_token);

        return self::SUCCESS;
    }
}
