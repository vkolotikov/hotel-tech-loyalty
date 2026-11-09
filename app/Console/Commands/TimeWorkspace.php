<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches HexaTech Time Planner (2026-11-09: the full admin's staff Planner as its own workspace, with AI planning) on
 * or off for one organisation. Every full customer has it by default (Organization::WORKSPACE_DEFAULTS), signing in to
 * the full admin; --off takes one out, --on --landing sends its staff to the Time Planner after signing in (an
 * organisation lands in one workspace only, so this takes the landing from any other), --list shows the organisations
 * that differ from the default.
 *
 * Off deletes nothing: the API answers 403 and /time sends staff back to the full admin, whose Planner stays as it is.
 * Sold on its own as the `time` module since 2026-11-09: an organisation that bought it has it always (it is its plan,
 * not to be switched off), one on modules without it cannot be given it here. A full customer's plan still needs
 * `time_management` (Enterprise).
 */
class TimeWorkspace extends Command
{
    protected $signature = 'workspace:time
                            {org? : Organization id}
                            {--on : Switch HexaTech Time Planner on}
                            {--off : Switch HexaTech Time Planner off}
                            {--landing : With --on: staff land on HexaTech Time Planner after signing in}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, or landing on HexaTech Time Planner)}';

    protected $description = 'Switch HexaTech Time Planner on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('time'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('time') ? 'on' : 'off',
                    $o->workspace('time')['landing'] ? 'time planner' : 'full admin',
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every full customer has HexaTech Time Planner on, landing on the full admin.');
            } else {
                $this->line('Every other full customer has HexaTech Time Planner on, landing on the full admin.');
                $this->table(['id', 'name', 'time planner', 'lands on'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:time <organisation id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if ($this->option('on') && !$org->holdsModule('time')) {
            $this->error($org->appointmentsOnly()
                ? sprintf('org %d (%s) is on the Appointments plan: HexaTech Time Planner is not part of it.', $org->id, $org->name)
                : sprintf('org %d (%s) is on modules without HexaTech Time Planner (%s): it is not part of its plan.', $org->id, $org->name, implode(', ', $org->planModules() ?? [])));

            return self::FAILURE;
        }
        if ($this->option('off') && in_array('time', $org->planModules() ?? [], true)) {
            $this->error(sprintf('org %d (%s) bought HexaTech Time Planner on its own: the workspace is its plan and cannot be switched off. Run workspace:appointments <organisation id> --not-only first if it should be a full customer.', $org->id, $org->name));

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('time', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('time', false);
        }

        $org = $org->fresh();
        $state = $org->workspace('time');
        $this->line(sprintf(
            'org %d (%s): HexaTech Time Planner %s%s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
            $state['enabled'] && !$org->hasFeature('time_management') ? ' (the plan has no time_management: the workspace says so and shows nothing else)' : '',
        ));

        return self::SUCCESS;
    }
}
