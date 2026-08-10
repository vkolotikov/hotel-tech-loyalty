<?php

namespace Tests\Feature\Loyalty;

use App\Services\MemberImportService;
use App\Services\QrCodeService;
use Tests\TestCase;

/**
 * Locks the CSV reader that a 5 000-customer migration depends on.
 *
 * Every case here is a file the previous inline parser mishandled, and
 * each failure mode was silent — the import reported success and dropped
 * or corrupted the data:
 *
 *  - a 500-row hard stop that still reported "500 of 500"
 *  - Excel's UTF-8 BOM fusing onto the first header, failing 100% of rows
 *  - a ragged row throwing an uncaught ValueError and 500-ing the request
 *  - semicolon-delimited European exports parsing as a single column
 *  - opening balances and join dates having nowhere to go
 */
class MemberImportParsingTest extends TestCase
{
    private function svc(): MemberImportService
    {
        return new MemberImportService(new QrCodeService());
    }

    /** Write a temp CSV and return its path. */
    private function csv(string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'imp') . '.csv';
        file_put_contents($path, $contents);
        return $path;
    }

    public function test_reads_far_beyond_the_old_500_row_cap(): void
    {
        $lines = ["name,email"];
        for ($i = 1; $i <= 5000; $i++) {
            $lines[] = "Customer {$i},customer{$i}@example.com";
        }

        $out = $this->svc()->parseFile($this->csv(implode("\n", $lines)));

        $this->assertSame(5000, $out['file_rows']);
        $this->assertCount(5000, $out['rows']);
        $this->assertFalse($out['truncated']);
    }

    public function test_reports_file_rows_honestly_when_truncated(): void
    {
        $lines = ["name,email"];
        for ($i = 1; $i <= MemberImportService::MAX_ROWS + 25; $i++) {
            $lines[] = "C{$i},c{$i}@example.com";
        }

        $out = $this->svc()->parseFile($this->csv(implode("\n", $lines)));

        // The whole point: rows kept is capped, but the reported file size
        // is the truth, so the UI can refuse a partial commit.
        $this->assertCount(MemberImportService::MAX_ROWS, $out['rows']);
        $this->assertSame(MemberImportService::MAX_ROWS + 25, $out['file_rows']);
        $this->assertTrue($out['truncated']);
    }

    public function test_strips_excel_utf8_bom_from_first_header(): void
    {
        $out = $this->svc()->parseFile($this->csv("\xEF\xBB\xBFname,email\nAnna,anna@example.com"));

        $this->assertContains('name', $out['headers']);
        $this->assertSame('Anna', $out['rows'][0]['name']);
        $this->assertSame('anna@example.com', $out['rows'][0]['email']);
    }

    public function test_sniffs_semicolon_delimiter(): void
    {
        $out = $this->svc()->parseFile($this->csv("name;email;points\nJanis;janis@example.lv;1500"));

        $this->assertSame(';', $out['delimiter']);
        $this->assertSame('Janis', $out['rows'][0]['name']);
        $this->assertSame('1500', $out['rows'][0]['points']);
    }

    public function test_sniffs_tab_delimiter(): void
    {
        $out = $this->svc()->parseFile($this->csv("name\temail\nTabby\ttab@example.com"));

        $this->assertSame("\t", $out['delimiter']);
        $this->assertSame('Tabby', $out['rows'][0]['name']);
    }

    public function test_ragged_row_with_extra_fields_does_not_throw(): void
    {
        // One stray comma in an address used to abort the entire import
        // with an uncaught ValueError and no line number.
        $out = $this->svc()->parseFile($this->csv(
            "name,email\nGood,good@example.com\nBad,bad@example.com,extra,more\nAlsoGood,also@example.com"
        ));

        $this->assertNull($out['error']);
        $this->assertCount(3, $out['rows']);
        $this->assertSame('bad@example.com', $out['rows'][1]['email']);
        $this->assertSame('also@example.com', $out['rows'][2]['email']);
    }

    public function test_short_row_is_padded_not_dropped(): void
    {
        $out = $this->svc()->parseFile($this->csv("name,email,phone\nShorty,short@example.com"));

        $this->assertCount(1, $out['rows']);
        $this->assertNull($out['rows'][0]['phone']);
    }

    public function test_blank_lines_are_skipped_not_counted(): void
    {
        $out = $this->svc()->parseFile($this->csv("name,email\nA,a@example.com\n\n\nB,b@example.com\n"));

        $this->assertSame(2, $out['file_rows']);
        $this->assertCount(2, $out['rows']);
    }

    public function test_maps_header_synonyms_to_canonical_columns(): void
    {
        $out = $this->svc()->parseFile($this->csv(
            "Full Name,E-Mail Address,Mobile Number,Membership Level,Points Balance,Member Since\n"
            . "Rita Ozola,rita@example.lv,+371 26 123 456,Gold,2400,2019-04-02"
        ));

        $row = $out['rows'][0];
        $this->assertSame('Rita Ozola', $row['name']);
        $this->assertSame('rita@example.lv', $row['email']);
        $this->assertSame('+371 26 123 456', $row['phone']);
        $this->assertSame('Gold', $row['tier_name']);
        $this->assertSame('2400', $row['points']);
        $this->assertSame('2019-04-02', $row['joined_at']);
        $this->assertSame([], $out['unmapped']);
    }

    public function test_first_and_last_name_columns_combine_into_name(): void
    {
        $out = $this->svc()->parseFile($this->csv("First Name,Last Name,Email\nRita,Ozola,rita@example.lv"));

        $svc = $this->svc();
        $ref = new \ReflectionMethod($svc, 'normaliseRow');
        $ref->setAccessible(true);
        $parsed = $ref->invoke($svc, $out['rows'][0]);

        $this->assertSame('Rita Ozola', $parsed['name']);
    }

    public function test_unrecognised_columns_are_reported_not_silently_dropped(): void
    {
        $out = $this->svc()->parseFile($this->csv("name,email,Favourite Colour\nA,a@example.com,blue"));

        $this->assertSame(['Favourite Colour'], $out['unmapped']);
    }

    public function test_empty_file_returns_a_readable_error(): void
    {
        $this->assertSame('The file is empty.', $this->svc()->parseFile($this->csv(''))['error']);
    }

    /** @dataProvider numberFormats */
    public function test_parses_real_world_number_formats(string $input, int $expected): void
    {
        $svc = $this->svc();
        $ref = new \ReflectionMethod($svc, 'toInt');
        $ref->setAccessible(true);

        $this->assertSame($expected, $ref->invoke($svc, $input));
    }

    public static function numberFormats(): array
    {
        return [
            'plain'             => ['1250', 1250],
            'thousands comma'   => ['1,250', 1250],
            'thousands dot'     => ['1.250', 1250],
            'thousands space'   => ['1 250', 1250],
            // Naive digit-stripping read this as 125 000 — a 100x
            // over-credit applied to every member in the file.
            'us decimal'        => ['1250.00', 1250],
            'us decimal rounds' => ['1250.60', 1251],
            'eu decimal'        => ['1250,00', 1250],
            'us grouped decimal'=> ['1,250.75', 1251],
            'eu grouped decimal'=> ['1.250,75', 1251],
            'currency'          => ['€1,250', 1250],
            'currency suffix'   => ['1250 pts', 1250],
            'negative'          => ['-50', -50],
            'empty'             => ['', 0],
            'garbage'           => ['n/a', 0],
        ];
    }

    public function test_parses_day_first_dates_without_month_swapping(): void
    {
        $svc = $this->svc();
        $ref = new \ReflectionMethod($svc, 'toDate');
        $ref->setAccessible(true);

        // 03/11/2024 is 3 November in every European export. Carbon's
        // default would read it as 11 March and corrupt the join date.
        $this->assertSame('2024-11-03', $ref->invoke($svc, '03/11/2024')->toDateString());
        $this->assertSame('2024-11-03', $ref->invoke($svc, '03.11.2024')->toDateString());
        $this->assertSame('2024-11-03', $ref->invoke($svc, '03-11-2024')->toDateString());

        // ISO is unambiguous and always wins.
        $this->assertSame('2024-11-03', $ref->invoke($svc, '2024-11-03')->toDateString());
        $this->assertSame('2024-11-03', $ref->invoke($svc, '2024/11/03')->toDateString());

        // A component above 12 can only be the day, whichever side it sits.
        $this->assertSame('2024-03-25', $ref->invoke($svc, '25/03/2024')->toDateString());
        $this->assertSame('2024-03-25', $ref->invoke($svc, '03/25/2024')->toDateString());

        // Two-digit years pivot at 70, matching every spreadsheet.
        $this->assertSame('2019-05-04', $ref->invoke($svc, '04/05/19')->toDateString());
        $this->assertSame('1995-05-04', $ref->invoke($svc, '04/05/95')->toDateString());

        // Impossible dates are rejected rather than rolling into next month.
        $this->assertNull($ref->invoke($svc, '31/02/2024'));
        $this->assertNull($ref->invoke($svc, 'not a date'));
        $this->assertNull($ref->invoke($svc, ''));
    }

    public function test_written_month_names_still_parse(): void
    {
        $svc = $this->svc();
        $ref = new \ReflectionMethod($svc, 'toDate');
        $ref->setAccessible(true);

        $this->assertSame('2019-04-02', $ref->invoke($svc, '2 April 2019')->toDateString());
        $this->assertSame('2019-04-02', $ref->invoke($svc, 'April 2, 2019')->toDateString());
    }

    public function test_parses_consent_flags(): void
    {
        $svc = $this->svc();
        $ref = new \ReflectionMethod($svc, 'toBool');
        $ref->setAccessible(true);

        foreach (['yes', 'YES', 'true', '1', 'y', 'subscribed'] as $truthy) {
            $this->assertTrue($ref->invoke($svc, $truthy), "expected '{$truthy}' to be true");
        }
        foreach (['no', 'false', '0', '', 'unsubscribed'] as $falsy) {
            $this->assertFalse($ref->invoke($svc, $falsy), "expected '{$falsy}' to be false");
        }
    }
}
