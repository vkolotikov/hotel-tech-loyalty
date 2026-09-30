<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches the appointments workspace on or off for one organisation.
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
                            {--list : List every organization that has the workspace on}';

    protected $description = 'Switch the appointments workspace on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceEnabled('appointments'))
                ->map(fn (Organization $o) => [$o->id, $o->name, $o->workspace('appointments')['landing'] ? 'on' : 'off'])
                ->values()->all();

            if ($rows === []) {
                $this->line('No organization has the appointments workspace on.');
            } else {
                $this->table(['id', 'name', 'landing'], $rows);
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
