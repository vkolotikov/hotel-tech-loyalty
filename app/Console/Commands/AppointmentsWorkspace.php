<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\Portal\PortalBootstrap;
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
 *
 * The Appointments plan (Part C): billing decides who is on it; --only and
 * --not-only override billing for one organisation, --plan-decides hands it
 * back. An appointments-only organisation has the workspace and nothing
 * else: no full admin, no loyalty. --only says what stops and asks first.
 */
class AppointmentsWorkspace extends Command
{
    protected $signature = 'workspace:appointments
                            {org? : Organization id}
                            {--on : Switch the workspace on}
                            {--off : Switch the workspace off}
                            {--landing : With --on: staff land on the workspace after signing in}
                            {--only : Mark the organization as on the Appointments plan (workspace only, no loyalty), whatever billing says}
                            {--not-only : Mark the organization as a full customer, whatever billing says}
                            {--plan-decides : Remove the mark: billing decides again}
                            {--force : With --only: do not ask for confirmation}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, landing on the workspace, or marked)}';

    protected $description = 'Switch the appointments workspace on or off for an organization, and mark who is on the Appointments plan.';

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
                    self::onlyLabel($o),
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has the appointments workspace on, landing on the full admin.');
            } else {
                $this->line('Every other organization has the appointments workspace on, landing on the full admin.');
                $this->table(['id', 'name', 'workspace', 'lands on', 'appointments-only'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:appointments <id> --on|--off|--only|--not-only|--plan-decides|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if (count(array_filter([$this->option('only'), $this->option('not-only'), $this->option('plan-decides')])) > 1) {
            $this->error('Choose one of --only, --not-only and --plan-decides.');

            return self::FAILURE;
        }
        if ($this->option('only') && $this->option('off')) {
            $this->error('An appointments-only organization always has the workspace: --only cannot go with --off.');

            return self::FAILURE;
        }
        if ($this->option('off') && $org->appointmentsOnly()) {
            $this->error(sprintf(
                'org %d (%s) is on the Appointments plan (%s): the workspace is all it has and cannot be switched off. Run --not-only first if it should have the full admin.',
                $org->id,
                $org->name,
                $org->appointmentsOnlySource(),
            ));

            return self::FAILURE;
        }

        if ($this->option('only') && !$this->markOnly($org)) {
            return self::SUCCESS;
        }
        if ($this->option('not-only')) {
            $org->setAppointmentsOnly(false);
        }
        if ($this->option('plan-decides')) {
            $org->setAppointmentsOnly(null);
        }

        if ($this->option('on')) {
            $org->setWorkspace('appointments', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('appointments', false);
        }

        $fresh = $org->fresh();
        $state = $fresh->workspace('appointments');
        $this->line(sprintf(
            'org %d (%s): appointments workspace %s%s, appointments-only: %s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
            self::onlyLabel($fresh),
        ));

        return self::SUCCESS;
    }

    /** Says what stops, asks, then marks. False when the operator said no. */
    private function markOnly(Organization $org): bool
    {
        $members = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $org->id)->count();
        $staff = Staff::withoutGlobalScopes()->where('organization_id', $org->id)->where('is_active', true)->count();

        $this->line(sprintf('Marking org %d (%s) appointments-only. What stops:', $org->id, $org->name));
        $this->line('  - loyalty programme: ' . (PortalBootstrap::loyaltyOn($org->id) ? 'on, and it will be off' : 'already off'));
        $this->line("  - loyalty members who lose the member portal and points: {$members}");
        $this->line("  - active staff accounts who lose the full admin (they keep the workspace): {$staff}");

        if (!$this->option('force') && !$this->confirm('Mark it appointments-only?', false)) {
            $this->line('Nothing changed.');

            return false;
        }

        $org->setAppointmentsOnly(true);

        return true;
    }

    private static function onlyLabel(Organization $org): string
    {
        $source = $org->appointmentsOnlySource();

        return ($org->appointmentsOnly() ? 'yes' : 'no') . ($source ? " ({$source})" : '');
    }
}
