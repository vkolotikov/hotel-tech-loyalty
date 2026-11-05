<?php

use App\Console\Commands\ForeignMemberAccounts;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Repairs, once, the memberships the guest link wrapped around another organisation's account before the security
 * review of 2026-11-04 (`php artisan loyalty:foreign-accounts --detach`, run on deploy so nobody types it: owner,
 * 2026-11-05). Each membership gets an account of its own; the account it pointed at is never changed. Every repair is
 * audited `member.account_detached` with the old account id, so it can be undone.
 *
 * Safe to run on every database: a membership whose account is its own is left alone, and an empty database does
 * nothing. Nobody could use such a membership (members sign in as members, at their own venue), so no one loses access.
 */
return new class extends Migration {
    public function up(): void
    {
        foreach (['users', 'loyalty_members', 'guests', 'audit_logs'] as $table) {
            if (!Schema::hasTable($table)) {
                return;
            }
        }

        $rows = ForeignMemberAccounts::links();
        if ($rows->isEmpty()) {
            return;
        }

        $repaired = $rows->filter(fn ($row) => ForeignMemberAccounts::repair($row))->count();
        Log::warning('detach_foreign_member_accounts', [
            'found'    => $rows->count(),
            'repaired' => $repaired,
            'members'  => $rows->pluck('id')->all(),
        ]);
    }

    public function down(): void
    {
        // Not undone automatically: the audit rows (`member.account_detached`) name each old account.
    }
};
