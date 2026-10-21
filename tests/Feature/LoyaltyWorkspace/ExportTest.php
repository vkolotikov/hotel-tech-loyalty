<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Http\Controllers\Api\V1\Admin\Loyalty\ExportController;
use App\Models\AuditLog;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The members list as a CSV file (spec 2026-10-21 release 2 §4.2): a manager's; the list's own filters and order;
 * UTF-8 with a byte-order mark; days on the venue's clock; no cell a spreadsheet would run; audited.
 */
class ExportTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
    }

    /** @return list<list<string>> */
    private function csv(string $query = ''): array
    {
        $response = $this->asManager()->get($this->api('members/export' . $query))->assertOk();
        $this->assertStringStartsWith('text/csv', $response->headers->get('Content-Type'));
        $body = $response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);

        return array_map(fn ($line) => str_getcsv($line, ',', '"', ''), array_values(array_filter(explode("\n", substr($body, 3)))));
    }

    public function test_it_writes_the_lists_members_with_their_columns(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->ada->user->update(['name' => 'Ada Lovelace-Byron', 'phone' => '+44 20 7946 0000']);
        $this->ada->update(['marketing_consent' => true, 'joined_at' => '2026-01-31 22:30:00', 'last_activity_at' => '2026-10-04 21:15:00']);
        $this->grace->user->update(['name' => 'Grâce Hopper']);
        $this->makeMember('Gone Member', 'gone@example.test', ['is_active' => false]);
        $this->otherOrganization();

        $rows = $this->csv('?sort=points');

        $this->assertSame(ExportController::COLUMNS, $rows[0]);
        $this->assertCount(3, $rows);
        $this->assertSame(['Ada Lovelace-Byron', $this->ada->user->email, '+44 20 7946 0000', $this->ada->member_number, 'Gold', '1500', '1500', '2026-02-01', '2026-10-05', 'yes', 'yes'], $rows[1]);
        $this->assertSame('Grâce Hopper', $rows[2][0]);
        $this->assertSame(['Silver', '200', 'no'], [$rows[2][4], $rows[2][5], $rows[2][10]]);
    }

    public function test_it_takes_the_lists_filters_and_is_audited_with_them(): void
    {
        $this->assertSame(['Grace Hopper'], array_column(array_slice($this->csv('?tier_id=' . $this->tiers['silver']->id), 1), 0));
        $this->assertSame(['Ada Lovelace'], array_column(array_slice($this->csv('?q=LOVE'), 1), 0));
        $this->assertCount(1, $this->csv('?state=inactive'));

        $audit = AuditLog::where('action', 'loyalty.members_exported')->orderBy('id')->firstOrFail();
        $this->assertSame(['filters' => ['tier_id' => $this->tiers['silver']->id], 'rows' => 1], $audit->new_values);
        $this->assertSame($this->manager->id, (int) $audit->causer_id);
        $this->assertSame(3, AuditLog::where('action', 'loyalty.members_exported')->count());
    }

    public function test_no_cell_starts_a_formula(): void
    {
        $this->grace->user->update(['name' => '=HYPERLINK("http://evil.test","x")', 'phone' => '+371 26 123 456']);

        $grace = collect($this->csv())->firstWhere(3, $this->grace->member_number);

        $this->assertSame('\'=HYPERLINK("http://evil.test","x")', $grace[0]);
        $this->assertSame('+371 26 123 456', $grace[2]);
        $this->assertSame("'@SUM(1)", ExportController::cell('@SUM(1)'));
        $this->assertSame('-120', ExportController::cell(-120));
    }

    public function test_the_export_is_a_managers(): void
    {
        $this->asStaffMember()->getJson($this->api('members/export'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->assertSame(0, AuditLog::where('action', 'loyalty.members_exported')->count());
    }
}
