<?php

namespace App\Console\Commands;

use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Switches HexaTech CRM (2026-11-07: the AI chat widget and the CRM in one workspace) on or off for one organisation.
 * Every organisation has it by default (Organization::WORKSPACE_DEFAULTS),
 * signing in to the full admin; --off takes one out, --on --landing sends its
 * staff to HexaTech CRM after signing in (an organisation lands in one
 * workspace only, so this takes the landing from any other), --list shows
 * the organisations that differ from the default.
 *
 * Off deletes nothing: the API answers 403 and /crm sends staff back to
 * the full admin. The Appointments plan does not include HexaTech CRM. Off hides only the workspace: the full admin's inbox, chatbot and CRM pages stay as they are.
 */
class CrmWorkspace extends Command
{
    protected $signature = 'workspace:crm
                            {org? : Organization id}
                            {--on : Switch HexaTech CRM on}
                            {--off : Switch HexaTech CRM off}
                            {--landing : With --on: staff land on HexaTech CRM after signing in}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, or landing on HexaTech CRM)}';

    protected $description = 'Switch HexaTech CRM on or off for an organization.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('crm'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('crm') ? 'on' : 'off',
                    $o->workspace('crm')['landing'] ? 'crm' : 'full admin',
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has HexaTech CRM on, landing on the full admin.');
            } else {
                $this->line('Every other organization has HexaTech CRM on, landing on the full admin.');
                $this->table(['id', 'name', 'crm', 'lands on'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:crm <id> --on|--off|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if ($this->option('on') && !$org->holdsModule('crm')) {
            $this->error($org->appointmentsOnly()
                ? sprintf('org %d (%s) is on the Appointments plan: HexaTech CRM is not part of it.', $org->id, $org->name)
                : sprintf('org %d (%s) is on modules without HexaTech CRM (%s): it is not part of its plan.', $org->id, $org->name, implode(', ', $org->planModules() ?? [])));

            return self::FAILURE;
        }

        if ($this->option('off') && in_array('crm', $org->planModules() ?? [], true)) {
            $this->error(sprintf('org %d (%s) bought HexaTech CRM on its own: the workspace is its plan and cannot be switched off. Run workspace:appointments <organisation id> --not-only first if it should be a full customer.', $org->id, $org->name));

            return self::FAILURE;
        }

        if ($this->option('on')) {
            $org->setWorkspace('crm', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('crm', false);
        }

        $state = $org->fresh()->workspace('crm');
        $this->line(sprintf(
            'org %d (%s): HexaTech CRM %s%s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
        ));

        return self::SUCCESS;
    }
}
