<?php

namespace Tests\Feature\Settings;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The BYO-SMTP removal must archive before it deletes, seed the replacement
 * rows, leave every other setting alone, and be reversible from the archive.
 *
 * The migration runs against production data that includes plaintext mail
 * passwords venues typed in; a deletion with no way back was the original
 * design and is exactly what this test refuses to let return.
 */
class RemoveDeadByoSmtpSettingsMigrationTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const MIGRATION = 'migrations/2026_08_14_100000_remove_dead_byo_smtp_settings.php';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // hotel_settings
        Schema::dropIfExists('hotel_settings_smtp_archive');
        DB::table('hotel_settings')->delete();
    }

    private function migration(): object
    {
        return require database_path(self::MIGRATION);
    }

    private function row(int $orgId, string $key, string $value, string $group = 'integrations'): void
    {
        DB::table('hotel_settings')->insert([
            'organization_id' => $orgId, 'key' => $key, 'value' => $value, 'type' => 'string',
            'group' => $group, 'label' => ucfirst(str_replace('_', ' ', $key)), 'scope' => 'company',
            'created_at' => '2026-01-02 03:04:05', 'updated_at' => '2026-01-02 03:04:05',
        ]);
    }

    public function test_up_archives_the_dead_rows_deletes_them_and_seeds_the_replacements(): void
    {
        $this->row(1, 'mail_host', 'smtp.venue-one.example');
        $this->row(1, 'mail_password', 'hunter2-in-plaintext');
        $this->row(1, 'mail_from_address', 'front@venue-one.example');
        $this->row(1, 'primary_color', '#123456', 'appearance');
        $this->row(2, 'mail_username', 'venue-two');
        $this->row(2, 'mail_reply_to', 'already@venue-two.example');

        $this->migration()->up();

        // Gone from the live table, every other setting untouched.
        $this->assertSame(0, DB::table('hotel_settings')->whereIn('key', ['mail_host', 'mail_port', 'mail_username', 'mail_password', 'mail_from_address'])->count());
        $this->assertSame('#123456', DB::table('hotel_settings')->where('organization_id', 1)->where('key', 'primary_color')->value('value'));

        // Archived first, values and timestamps intact.
        $archived = DB::table('hotel_settings_smtp_archive')->orderBy('id')->get();
        $this->assertCount(4, $archived);
        $this->assertSame('hunter2-in-plaintext', $archived->firstWhere('key', 'mail_password')->value);
        $this->assertSame(1, (int) $archived->firstWhere('key', 'mail_password')->organization_id);
        $this->assertSame('2026-01-02 03:04:05', (string) $archived->firstWhere('key', 'mail_host')->original_updated_at);
        $this->assertNotNull($archived->firstWhere('key', 'mail_host')->archived_at);

        // The replacement pair exists once per org, and an existing value is kept.
        foreach ([1, 2] as $orgId) {
            $this->assertSame(1, DB::table('hotel_settings')->where('organization_id', $orgId)->where('key', 'mail_from_name')->count());
            $this->assertSame(1, DB::table('hotel_settings')->where('organization_id', $orgId)->where('key', 'mail_reply_to')->count());
        }
        $this->assertSame('already@venue-two.example', DB::table('hotel_settings')->where('organization_id', 2)->where('key', 'mail_reply_to')->value('value'));
        $this->assertSame('', DB::table('hotel_settings')->where('organization_id', 1)->where('key', 'mail_reply_to')->value('value'));
    }

    public function test_up_is_idempotent(): void
    {
        $this->row(1, 'mail_password', 'hunter2');

        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(1, DB::table('hotel_settings_smtp_archive')->count());
        $this->assertSame(1, DB::table('hotel_settings')->where('organization_id', 1)->where('key', 'mail_from_name')->count());
    }

    public function test_down_restores_the_archived_rows_without_duplicating_existing_ones(): void
    {
        $this->row(1, 'mail_host', 'smtp.venue-one.example');
        $this->row(1, 'mail_password', 'hunter2');

        $migration = $this->migration();
        $migration->up();
        $this->assertSame(0, DB::table('hotel_settings')->where('key', 'mail_password')->count());

        $migration->down();

        $restored = DB::table('hotel_settings')->where('organization_id', 1)->whereIn('key', ['mail_host', 'mail_password'])->get()->keyBy('key');
        $this->assertCount(2, $restored);
        $this->assertSame('hunter2', $restored['mail_password']->value);
        $this->assertSame('integrations', $restored['mail_host']->group);
        $this->assertSame('2026-01-02 03:04:05', (string) $restored['mail_host']->updated_at);

        // A second down() adds nothing.
        $migration->down();
        $this->assertSame(1, DB::table('hotel_settings')->where('organization_id', 1)->where('key', 'mail_password')->count());
    }
}
