<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\OwnAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Memberships whose sign-in account is not their organisation's own member account (security review, 2026-11-04):
 * links `GuestMemberLinkService` made before the fix, when a guest's address matched another venue's member or a staff
 * login. Lists them (read only); `--detach` gives each its own account (`MemberErasure::detach()`), leaving the other
 * account exactly as it was. The membership keeps its points, number and history; the venue then sets its person's
 * email again if it has one of its own for them.
 */
class ForeignMemberAccounts extends Command
{
    protected $signature = 'loyalty:foreign-accounts {--org= : Only this organisation id} {--detach : Give each such membership an account of its own}';

    protected $description = 'List (and with --detach repair) memberships linked to an account of another organisation or a staff login.';

    public function handle(): int
    {
        $rows = DB::table('loyalty_members')
            ->join('users', 'users.id', '=', 'loyalty_members.user_id')
            ->where(fn ($q) => $q->whereColumn('users.organization_id', '!=', 'loyalty_members.organization_id')
                ->orWhereNull('users.organization_id')
                ->orWhere('users.user_type', '!=', 'member'))
            ->when($this->option('org'), fn ($q, $org) => $q->where('loyalty_members.organization_id', (int) $org))
            ->orderBy('loyalty_members.organization_id')->orderBy('loyalty_members.id')
            ->get(['loyalty_members.id', 'loyalty_members.organization_id', 'loyalty_members.member_number', 'users.user_type', 'users.organization_id as account_org']);

        if ($rows->isEmpty()) {
            $this->info('No membership is linked to an account of another organisation or a staff login.');

            return self::SUCCESS;
        }

        $this->table(['member id', 'organisation', 'member number', 'account type', "account's organisation"],
            $rows->map(fn ($r) => [$r->id, $r->organization_id, $r->member_number, $r->user_type, $r->account_org ?? '—'])->all());
        $this->warn(count($rows) . ' membership(s) linked to an account that is not their organisation\'s own member account.');

        if (!$this->option('detach')) {
            $this->line('Run again with --detach to give each its own account (the other account is not touched).');

            return self::SUCCESS;
        }

        $done = 0;
        foreach ($rows as $row) {
            $member = LoyaltyMember::withoutGlobalScopes()->with('user')->find($row->id);
            if ($member === null || OwnAccount::holds($member)) {
                continue;
            }
            DB::transaction(fn () => MemberErasure::detach($member));
            $done++;
        }
        $this->info("Detached {$done} membership(s).");

        return self::SUCCESS;
    }
}
