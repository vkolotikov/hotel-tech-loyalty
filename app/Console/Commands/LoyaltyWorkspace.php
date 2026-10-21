<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches HexaTech Loyalty (spec 2026-10-21) on or off for one organisation.
 * Every organisation has it by default (Organization::WORKSPACE_DEFAULTS),
 * signing in to the full admin; --off takes one out, --on --landing sends its
 * staff to HexaTech Loyalty after signing in (an organisation lands in one
 * workspace only, so this takes the landing from any other), --list shows
 * the organisations that differ from the default.
 *
 * Off deletes nothing: the API answers 403 and /loyalty sends staff back to
 * the full admin, whose member and programme screens keep working. The
 * Appointments plan does not include HexaTech Loyalty.
 */
class LoyaltyWorkspace extends Command
{
    protected $signature = 'workspace:loyalty
                            {org? : Organization id}
                            {--on : Switch HexaTech Loyalty on}
                            {--off : Switch HexaTech Loyalty off}
                            {--landing : With --on: staff land on HexaTech Loyalty after signing in}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, or landing on HexaTech Loyalty)}';

    protected $description = 'Switch HexaTech Loyalty on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('loyalty'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('loyalty') ? 'on' : 'off',
                    $o->workspace('loyalty')['landing'] ? 'loyalty' : 'full admin',
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has HexaTech Loyalty on, landing on the full admin.');
            } else {
                $this->line('Every other organization has HexaTech Loyalty on, landing on the full admin.');
                $this->table(['id', 'name', 'loyalty', 'lands on'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:loyalty <id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if ($this->option('on') && $org->appointmentsOnly()) {
            $this->error(sprintf('org %d (%s) is on the Appointments plan: HexaTech Loyalty is not part of it.', $org->id, $org->name));

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('loyalty', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('loyalty', false);
        }

        $state = $org->fresh()->workspace('loyalty');
        $this->line(sprintf(
            'org %d (%s): HexaTech Loyalty %s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
        ));

        return self::SUCCESS;
    }
}
