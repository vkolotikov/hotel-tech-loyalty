<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches the appointments workspace on or off for one organisation. Every
 * organisation has it by default (Organization::WORKSPACE_DEFAULTS), signing
 * in to the full admin; --off takes one out, --on --landing sends its staff
 * to the workspace after signing in, --list shows the organisations that
 * differ from the default.
 *
 * Off deletes nothing: the API answers 403, /appointments sends staff back
 * to the full admin and sign-in lands on the dashboard. It does not undo a
 * booking, a status change or a points award made while it was on.
 */
class AppointmentsWorkspace extends Command
{
    protected $signature = 'workspace:appointments
                            {org? : Organization id}
                            {--on : Switch the workspace on}
                            {--off : Switch the workspace off}
                            {--landing : With --on: staff land on the workspace after signing in}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, or landing on the workspace)}';

    protected $description = 'Switch the appointments workspace on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('appointments'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('appointments') ? 'on' : 'off',
                    $o->workspace('appointments')['landing'] ? 'workspace' : 'full admin',
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has the appointments workspace on, landing on the full admin.');
            } else {
                $this->line('Every other organization has the appointments workspace on, landing on the full admin.');
                $this->table(['id', 'name', 'workspace', 'lands on'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:appointments <id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('appointments', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('appointments', false);
        }

        $state = $org->fresh()->workspace('appointments');
        $this->line(sprintf(
            'org %d (%s): appointments workspace %s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
        ));

        return self::SUCCESS;
    }
}
