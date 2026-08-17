<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Delete the bring-your-own-SMTP settings rows.
 *
 * WHY THEY GO RATHER THAN GET WIRED UP
 *
 * They never worked. `mail_host`, `mail_port`, `mail_username` and
 * `mail_password` were stored per organisation and read by nothing — a customer
 * could type their mail server credentials into Settings, save, and the app
 * would carry on sending through the platform relay exactly as before. The
 * screen implied otherwise, which is worse than having no screen.
 *
 * Wiring them up was the other option and was rejected:
 *
 *  1. A server-side SMTP client pointed at a tenant-supplied host is an SSRF
 *     vector. `mail_host` is attacker-controlled input; nothing stopped it
 *     naming an internal address or a cloud metadata endpoint, and the
 *     connection would be made by our infrastructure, from inside our network.
 *  2. It is redundant. The platform is moving to Amazon SES, where a venue
 *     sends as itself by verifying a DOMAIN — publishing DKIM records they
 *     control — not by handing us a password to their mail server.
 *  3. Credentials we do not hold cannot leak. `mail_password` was stored in
 *     plaintext until recently, and was additionally written to the cache store
 *     in the clear.
 *
 * `mail_from_address` goes too: the From address must stay on the platform's
 * authenticated domain or DMARC alignment breaks (see MailIdentityService).
 * Its one consumer, BookingRefundMail, now reads the org's own email.
 *
 * WHAT REPLACES THEM
 * `mail_from_name` and `mail_reply_to` — the parts a venue can safely control,
 * consumed by MailIdentityService.
 *
 * This migration DELETES stored values, including any plaintext SMTP password
 * a customer entered. That is deliberate: it is a credential we should never
 * have held, and leaving it in the table is the risk.
 */
return new class extends Migration
{
    private const DEAD_KEYS = [
        'mail_host',
        'mail_port',
        'mail_username',
        'mail_password',
        'mail_from_address',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('hotel_settings')) {
            return;
        }

        $deleted = DB::table('hotel_settings')
            ->whereIn('key', self::DEAD_KEYS)
            ->delete();

        // Seed the replacement rows for every org that had the old block, so
        // the settings screen is not empty for existing customers.
        $orgIds = DB::table('hotel_settings')->distinct()->pluck('organization_id');

        foreach ($orgIds as $orgId) {
            foreach ([
                ['mail_from_name', 'Sender name'],
                ['mail_reply_to',  'Reply-to address'],
            ] as [$key, $label]) {
                $exists = DB::table('hotel_settings')
                    ->where('organization_id', $orgId)
                    ->where('key', $key)
                    ->exists();

                if (!$exists) {
                    DB::table('hotel_settings')->insert([
                        'organization_id' => $orgId,
                        'key'             => $key,
                        'value'           => '',
                        'type'            => 'string',
                        'group'           => 'integrations',
                        'label'           => $label,
                        'created_at'      => now(),
                        'updated_at'      => now(),
                    ]);
                }
            }
        }

        // The settings map is cached per org; stale entries would keep serving
        // the deleted keys until the TTL expired.
        try {
            \Illuminate\Support\Facades\Cache::flush();
        } catch (\Throwable) {
            // Cache flush is a nicety, not a reason to fail the migration.
        }

        info("Removed {$deleted} dead BYO-SMTP setting rows.");
    }

    public function down(): void
    {
        // Deliberately irreversible. Re-creating the rows would re-create a
        // settings screen that does nothing and an SSRF surface; the stored
        // credentials are gone and should stay gone.
    }
};
