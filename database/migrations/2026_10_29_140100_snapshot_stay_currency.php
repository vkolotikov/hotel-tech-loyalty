<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Bound lock duration per row; PostgreSQL otherwise wraps the whole backfill in one transaction.
    public $withinTransaction = false;

    public function up(): void
    {
        DB::table('booking_mirror')->select('id')->orderBy('id')->chunkById(250, function ($rows) {
            foreach ($rows as $row) {
                DB::transaction(function () use ($row) {
                    // An old worker may have synced this booking since the chunk was read.
                    $current = DB::table('booking_mirror')->where('id', $row->id)->lockForUpdate()->first();
                    if (!$current) return;
                    $raw = json_decode($current->raw_json ?? '{}', true) ?: [];
                    if (!empty($raw['currency'])) return;
                    $provider = is_array($raw['price'] ?? null) ? ($raw['price']['currency'] ?? null) : ($raw['priceCurrency'] ?? null);
                    $lineCurrencies = DB::table('booking_price_elements')->where('booking_mirror_id', $current->id)->whereNotNull('currency_code')->distinct()->pluck('currency_code')->filter()->values();
                    if (!$provider && $lineCurrencies->count() === 1) $provider = $lineCurrencies->first();
                    $fallback = DB::table('hotel_settings')->where('organization_id', $current->organization_id)->where('key', 'booking_currency')->value('value');
                    $raw['currency'] = strtoupper((string) ($provider ?: ($fallback ?: 'EUR')));
                    $raw['_currency_source'] = $provider ? 'provider_snapshot' : 'venue_setting_at_backfill';
                    DB::table('booking_mirror')->where('id', $current->id)->update(['raw_json' => json_encode($raw)]);
                });
            }
        });
    }

    public function down(): void {}
};
