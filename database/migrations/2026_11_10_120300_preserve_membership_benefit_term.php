<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('loyalty_members', fn (Blueprint $t) => $t->boolean('membership_period_enforced')->default(false));
        DB::table('loyalty_members')->where(fn ($q) => $q->where('membership_mode', 'assigned')->orWhereNotNull('membership_valid_from'))
            ->update(['membership_period_enforced' => true]);
    }
    public function down(): void
    {
        Schema::table('loyalty_members', fn (Blueprint $t) => $t->dropColumn('membership_period_enforced'));
    }
};
