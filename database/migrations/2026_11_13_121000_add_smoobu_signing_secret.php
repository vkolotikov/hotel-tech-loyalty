<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('brands') && !Schema::hasColumn('brands', 'pms_smoobu_api_secret')) Schema::table('brands', fn (Blueprint $t) => $t->text('pms_smoobu_api_secret')->nullable());
        // Encrypt an already-entered setting as well as all future saves; never log a value.
        if (Schema::hasTable('hotel_settings')) {
            foreach (DB::table('hotel_settings')->where('key', 'booking_smoobu_api_secret')->whereNotNull('value')->get(['id', 'value', 'organization_id']) as $row) {
                if ($row->value === '') continue;
                try { Crypt::decryptString($row->value); } catch (\Illuminate\Contracts\Encryption\DecryptException) {
                    DB::table('hotel_settings')->where('id', $row->id)->update(['value' => Crypt::encryptString($row->value)]);
                }
                \App\Models\HotelSetting::flushCacheFor($row->organization_id);
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('brands', 'pms_smoobu_api_secret')) Schema::table('brands', fn (Blueprint $t) => $t->dropColumn('pms_smoobu_api_secret'));
    }
};
