<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\OwnAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Memberships whose sign-in account is not their organisation's own member account (security review, 2026-11-04):
 * links `GuestMemberLinkService` made before the fix, when a guest's address matched another venue's member or a staff
 * login. Lists them (read only); `--detach` gives each its own account (`MemberErasure::detach()`), leaving the other
 * account exactly as it was. The membership keeps its points, number and history; the venue then sets its person's
 * email again if it has one of its own for them.
 *
 * The migration `2026_11_05_090000_detach_foreign_member_accounts` ran the repair once on deploy (owner, 2026-11-05:
 * nothing typed by hand). Each repair is audited `member.account_detached` with the account it replaced, so it can be
 * undone by pointing `loyalty_members.user_id` back. Nobody could use such a membership: the members' app and the
 * portal sign in members only (`user_type` member), and a member signed in at their own venue sees only that venue's.
 */
class ForeignMemberAccounts extends Command
{
    protected $signature = 'loyalty:foreign-accounts {--org= : Only this organisation id} {--detach : Give each such membership an account of its own}';

    protected $description = 'List (and with --detach repair) memberships linked to an account of another organisation or a staff login.';

    /** @return Collection<int, \stdClass> one row per membership linked to an account that is not its own */
    public static function links(?int $organizationId = null): Collection
    {
        return DB::table('loyalty_members')
            ->join('users', 'users.id', '=', 'loyalty_members.user_id')
            ->where(fn ($q) => $q->whereColumn('users.organization_id', '!=', 'loyalty_members.organization_id')
                ->orWhereNull('users.organization_id')
                ->orWhere('users.user_type', '!=', 'member'))
            ->when($organizationId, fn ($q, $org) => $q->where('loyalty_members.organization_id', (int) $org))
            ->orderBy('loyalty_members.organization_id')->orderBy('loyalty_members.id')
            ->get(['loyalty_members.id', 'loyalty_members.organization_id', 'loyalty_members.member_number',
                'loyalty_members.user_id', 'users.user_type', 'users.organization_id as account_org']);
    }

    /** Gives one listed membership an account of its own and audits it; false when it no longer needs one. */
    public static function repair(\stdClass $row): bool
    {
        return DB::transaction(function () use ($row) {
            $member = LoyaltyMember::withoutGlobalScopes()->with('user')->lockForUpdate()->find($row->id);
            $old = $member?->user;
            if ($member === null || !$old instanceof User || OwnAccount::holds($member)) {
                return false;
            }
            MemberErasure::detach($member);
            AuditLog::create([
                'organization_id' => (int) $member->getAttribute('organization_id'),
                'action'          => 'member.account_detached',
                'subject_type'    => LoyaltyMember::class,
                'subject_id'      => (int) $member->id,
                'old_values'      => ['user_id' => (int) $old->id, 'account_type' => $old->user_type,
                    'account_organization_id' => $old->organization_id === null ? null : (int) $old->organization_id],
                'new_values'      => ['user_id' => (int) $member->getAttribute('user_id')],
                'description'     => 'Member #' . $member->getAttribute('member_number') . ' given an account of its own; the account it was linked to is not touched',
            ]);

            return true;
        });
    }

    public function handle(): int
    {
        $rows = self::links($this->option('org') ? (int) $this->option('org') : null);

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

        $done = $rows->filter(fn ($row) => self::repair($row))->count();
        $this->info("Detached {$done} membership(s).");

        return self::SUCCESS;
    }
}
