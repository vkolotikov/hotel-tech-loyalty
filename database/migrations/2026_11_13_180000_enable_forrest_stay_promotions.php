<?php

use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_promotions')) return;
        // Public booking identifier verified on forrestglamp.lv's embedded /book page.
        // A name/slug search must never switch on another organisation's campaigns.
        $token = 'j2Zr6S7OxWbuAp0YhdcgJvUnoBYAsCmr';
        $brandQuery = DB::table('brands')->where('widget_token', $token);
        if (Schema::hasColumn('brands', 'deleted_at')) $brandQuery->whereNull('deleted_at');
        $brand = $brandQuery->first(['id', 'organization_id']);
        $orgIds = DB::table('organizations')->where('widget_token', $token)->pluck('id');
        if ($brand) $orgIds->push($brand->organization_id);
        $orgIds = $orgIds->unique()->values();
        if ($orgIds->isEmpty()) return;
        if ($orgIds->count() !== 1) throw new LogicException('Forrest booking identifier is ambiguous; no promotion settings changed.');
        $orgId = (int) $orgIds->first();
        $currency = strtoupper((string) (DB::table('hotel_settings')->where('organization_id', $orgId)->where('key', 'booking_currency')->value('value') ?: 'EUR'));
        DB::transaction(function () use ($orgId, $brand, $currency) {
            $before = DB::table('hotel_settings')->where('organization_id', $orgId)->where('key', 'booking_promotions_enabled')->value('value');
            DB::table('hotel_settings')->updateOrInsert(['organization_id' => $orgId, 'key' => 'booking_promotions_enabled'], ['value' => '1', 'type' => 'boolean', 'group' => 'booking', 'updated_at' => now()]);
            foreach ([['VIPFORREST', 'Second night free', 'second_night_free', 0, 2], ['EARLYFOR20', 'Early booking · 20%', 'percentage', 20, 1], ['BLACKFOR15', 'Black Friday · 15%', 'percentage', 15, 1]] as [$code, $name, $type, $value, $min]) {
                DB::table('booking_promotions')->insertOrIgnore(['organization_id' => $orgId, 'brand_id' => $brand?->id, 'code' => $code, 'name' => $name, 'type' => $type, 'value' => $value, 'currency' => $currency,
                    'status' => 'draft', 'min_nights' => $min, 'room_ids' => '[]', 'excluded_dates' => '[]', 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
            }
            AuditLog::create(['organization_id' => $orgId, 'action' => 'booking.promotions_enabled', 'old_values' => ['enabled' => $before], 'new_values' => ['enabled' => true], 'description' => 'Owner-requested Forrest launch: promo entry enabled and missing codes prepared as drafts; campaign dates remain an admin choice.']);
        });
        HotelSetting::flushCacheFor($orgId);
    }

    public function down(): void
    {
        // Campaigns may have been edited or used since deployment. Keep operator-owned data.
    }
};
