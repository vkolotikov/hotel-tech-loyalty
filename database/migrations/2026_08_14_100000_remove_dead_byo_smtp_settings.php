<?php

use App\Models\HotelSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Retire the bring-your-own-SMTP settings rows.
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
 *     plaintext, and was additionally written to the cache store in the clear.
 *
 * `mail_from_address` goes too: the From address must stay on the platform's
 * authenticated domain or DMARC alignment breaks (see MailIdentityService).
 * Its one consumer, BookingRefundMail, now reads the org's own email.
 *
 * WHAT REPLACES THEM
 * `mail_from_name` and `mail_reply_to` — the parts a venue can safely control,
 * consumed by MailIdentityService.
 *
 * ARCHIVED, NOT DESTROYED. The rows are copied into `hotel_settings_smtp_archive`
 * before they are deleted, so the deletion can be reversed (`down()`) and any
 * venue that had actually set a value can be found afterwards without a
 * hand-run export beforehand. The archive holds whatever the rows held — a
 * plaintext password included, exactly as the live table did until now — so it
 * is to be dropped once the cutover is done and nobody has needed it:
 *
 *     DROP TABLE hotel_settings_smtp_archive;
 *
 * The settings cache is invalidated PER ORGANISATION through the model's own
 * `flushCacheFor()`, not with a store-wide flush: the cache store also carries
 * throttle counters, wallet nonces and everything else, none of which this
 * migration has any business emptying.
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

    private const ARCHIVE = 'hotel_settings_smtp_archive';

    public function up(): void
    {
        if (!Schema::hasTable('hotel_settings')) {
            return;
        }

        if (!Schema::hasTable(self::ARCHIVE)) {
            Schema::create(self::ARCHIVE, function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('original_id')->nullable();
                $table->unsignedBigInteger('organization_id');
                $table->string('key', 100);
                $table->text('value')->nullable();
                $table->string('type', 32)->nullable();
                $table->string('group', 32)->nullable();
                $table->string('label')->nullable();
                $table->text('description')->nullable();
                $table->string('scope', 16)->nullable();
                $table->timestamp('original_created_at')->nullable();
                $table->timestamp('original_updated_at')->nullable();
                $table->timestamp('archived_at');
                $table->index(['organization_id', 'key']);
            });
        }

        $columns = Schema::getColumnListing('hotel_settings');
        $has     = fn (string $column) => in_array($column, $columns, true);

        $rows = DB::table('hotel_settings')
            ->whereIn('key', self::DEAD_KEYS)
            ->orderBy('id')
            ->get();

        $archivedAt = now();

        foreach ($rows->chunk(200) as $chunk) {
            DB::table(self::ARCHIVE)->insert($chunk->map(fn ($row) => [
                'original_id'         => $row->id,
                'organization_id'     => $row->organization_id,
                'key'                 => $row->key,
                'value'               => $row->value,
                'type'                => $has('type') ? $row->type : null,
                'group'               => $has('group') ? $row->group : null,
                'label'               => $has('label') ? $row->label : null,
                'description'         => $has('description') ? $row->description : null,
                'scope'               => $has('scope') ? $row->scope : null,
                'original_created_at' => $has('created_at') ? $row->created_at : null,
                'original_updated_at' => $has('updated_at') ? $row->updated_at : null,
                'archived_at'         => $archivedAt,
            ])->all());
        }

        // Every org that has a settings block — read BEFORE the delete, so an
        // org whose only rows were the dead keys still gets its replacements.
        $orgIds = DB::table('hotel_settings')->distinct()->pluck('organization_id');

        $deleted = DB::table('hotel_settings')
            ->whereIn('key', self::DEAD_KEYS)
            ->delete();

        // Seed the replacement rows for every org that had a settings block,
        // so the settings screen is not empty for existing customers.

        foreach ($orgIds as $orgId) {
            foreach ([
                ['mail_from_name', 'Sender name',      'The name recipients see on email from your venue. Defaults to your organisation name.'],
                ['mail_reply_to',  'Reply-to address', 'Where replies go. Defaults to your organisation email.'],
            ] as [$key, $label, $description]) {
                $exists = DB::table('hotel_settings')
                    ->where('organization_id', $orgId)
                    ->where('key', $key)
                    ->exists();

                if (!$exists) {
                    $insert = [
                        'organization_id' => $orgId,
                        'key'             => $key,
                        'value'           => '',
                        'type'            => 'string',
                        'group'           => 'integrations',
                        'label'           => $label,
                        'created_at'      => now(),
                        'updated_at'      => now(),
                    ];

                    if ($has('description')) {
                        $insert['description'] = $description;
                    }

                    DB::table('hotel_settings')->insert($insert);
                }
            }
        }

        // The settings map is cached per org; a stale entry would keep serving
        // the deleted keys until its TTL expired.
        $touched = $rows->pluck('organization_id')->merge($orgIds)->unique();

        foreach ($touched as $orgId) {
            try {
                HotelSetting::flushCacheFor((int) $orgId);
            } catch (\Throwable) {
                // A cache miss on the next read is the worst case; not a
                // reason to fail the migration.
            }
        }

        Log::info("Archived and removed {$deleted} BYO-SMTP setting rows into " . self::ARCHIVE . '.');
    }

    public function down(): void
    {
        if (!Schema::hasTable(self::ARCHIVE) || !Schema::hasTable('hotel_settings')) {
            return;
        }

        $columns = Schema::getColumnListing('hotel_settings');
        $has     = fn (string $column) => in_array($column, $columns, true);

        $touched = [];

        foreach (DB::table(self::ARCHIVE)->orderBy('id')->get() as $row) {
            $exists = DB::table('hotel_settings')
                ->where('organization_id', $row->organization_id)
                ->where('key', $row->key)
                ->exists();

            if ($exists) {
                continue;
            }

            $insert = [
                'organization_id' => $row->organization_id,
                'key'             => $row->key,
                'value'           => $row->value,
                'created_at'      => $row->original_created_at ?? now(),
                'updated_at'      => $row->original_updated_at ?? now(),
            ];

            foreach (['type', 'group', 'label', 'description', 'scope'] as $column) {
                if ($has($column)) {
                    $insert[$column] = $row->{$column};
                }
            }

            DB::table('hotel_settings')->insert($insert);
            $touched[$row->organization_id] = true;
        }

        foreach (array_keys($touched) as $orgId) {
            try {
                HotelSetting::flushCacheFor((int) $orgId);
            } catch (\Throwable) {
            }
        }

        // The archive is left in place on purpose: it is the record of what
        // was restored. Drop it by hand when it is no longer wanted.
    }
};
