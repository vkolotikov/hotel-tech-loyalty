<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->timestamp('platform_operator_granted_at')->nullable());
        // Preserve preexisting configured operators without falsely stamping mailbox verification.
        // New staff identities must prove mailbox control before the email allowlist grants a bypass.
        $emails = array_values(array_filter(array_map(fn ($email) => strtolower(trim($email)),
            explode(',', (string) config('services.saas.platform_admin_emails', '')))));
        if ($emails !== []) {
            DB::table('users')->where('user_type', 'staff')->whereIn(DB::raw('lower(email)'), $emails)
                ->update(['platform_operator_granted_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('platform_operator_granted_at'));
    }
};
