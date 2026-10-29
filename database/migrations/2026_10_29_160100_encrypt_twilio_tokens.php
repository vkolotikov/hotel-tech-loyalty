<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('hotel_settings')->where('key', 'twilio_auth_token')->orderBy('id')->chunkById(100, function ($rows) {
            foreach ($rows as $row) {
                if ($row->value === null || $row->value === '') continue;
                try {
                    Crypt::decryptString($row->value);
                } catch (\Illuminate\Contracts\Encryption\DecryptException) {
                    DB::table('hotel_settings')->where('id', $row->id)->where('value', $row->value)
                        ->update(['value' => Crypt::encryptString($row->value)]);
                }
                \App\Models\HotelSetting::flushCacheFor($row->organization_id);
            }
        });
    }

    public function down(): void
    {
        // Deliberately never turn credentials back into plaintext.
    }
};
