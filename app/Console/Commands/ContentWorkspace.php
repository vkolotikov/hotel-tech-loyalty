<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches HexaTech Content (spec 2026-10-14) on or off for one organisation.
 * Every organisation has it by default (Organization::WORKSPACE_DEFAULTS),
 * signing in to the full admin; --off takes one out, --on --landing sends its
 * staff to HexaTech Content after signing in (an organisation lands in one
 * workspace only, so this takes the landing from Appointments), --list shows
 * the organisations that differ from the default.
 *
 * Off deletes nothing: the API answers 403 and /content sends staff back to
 * the full admin. The Appointments plan does not include HexaTech Content.
 */
class ContentWorkspace extends Command
{
    protected $signature = 'workspace:content
                            {org? : Organization id}
                            {--on : Switch HexaTech Content on}
                            {--off : Switch HexaTech Content off}
                            {--landing : With --on: staff land on HexaTech Content after signing in}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, or landing on HexaTech Content)}';

    protected $description = 'Switch HexaTech Content on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('content'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('content') ? 'on' : 'off',
                    $o->workspace('content')['landing'] ? 'content' : 'full admin',
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has HexaTech Content on, landing on the full admin.');
            } else {
                $this->line('Every other organization has HexaTech Content on, landing on the full admin.');
                $this->table(['id', 'name', 'content', 'lands on'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:content <id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if ($this->option('on') && $org->appointmentsOnly()) {
            $this->error(sprintf('org %d (%s) is on the Appointments plan: HexaTech Content is not part of it.', $org->id, $org->name));

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('content', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('content', false);
        }

        $state = $org->fresh()->workspace('content');
        $this->line(sprintf(
            'org %d (%s): HexaTech Content %s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
        ));

        return self::SUCCESS;
    }
}
