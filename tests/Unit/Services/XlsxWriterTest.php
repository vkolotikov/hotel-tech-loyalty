<?php

namespace Tests\Unit\Services;

use App\Services\XlsxWriter;
use PHPUnit\Framework\TestCase;
use ZipArchive;

/**
 * Locks the XlsxWriter contract — the dependency-free workbook
 * builder behind the styled Leads / Customers exports.
 *
 * Why this matters: the writer hand-assembles SpreadsheetML. A
 * malformed part (bad escaping, wrong cell ref past column Z, missing
 * zip member) makes Excel reject the whole file with "file is
 * corrupt" — for every export, every org. These tests unzip the
 * output and assert on the actual XML so regressions surface here
 * and not in a customer's download folder.
 */
class XlsxWriterTest extends TestCase
{
    /** @var string[] temp files to unlink */
    private array $tempFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->tempFiles as $f) {
            @unlink($f);
        }
        parent::tearDown();
    }

    private function build(callable $setup): string
    {
        $w = new XlsxWriter('Leads');
        $setup($w);
        $path = $w->toTempFile();
        $this->tempFiles[] = $path;
        return $path;
    }

    private function zipPart(string $path, string $part): string
    {
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($path), 'output must be a readable zip');
        $content = $zip->getFromName($part);
        $zip->close();
        $this->assertNotFalse($content, "zip must contain {$part}");
        return $content;
    }

    public function test_produces_all_required_workbook_parts(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([['header' => 'ID', 'type' => 'number']]);
            $w->addRow([1]);
        });

        foreach ([
            '[Content_Types].xml',
            '_rels/.rels',
            'xl/workbook.xml',
            'xl/_rels/workbook.xml.rels',
            'xl/styles.xml',
            'xl/worksheets/sheet1.xml',
        ] as $part) {
            $this->zipPart($path, $part);
        }
    }

    public function test_sheet_has_frozen_header_autofilter_and_styled_header(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([
                ['header' => 'ID', 'width' => 8, 'type' => 'number'],
                ['header' => 'Guest', 'width' => 24],
            ]);
            $w->addRow([7, 'Jane Doe']);
            $w->addRow([8, 'John Roe']);
        });

        $sheet = $this->zipPart($path, 'xl/worksheets/sheet1.xml');

        $this->assertStringContainsString('state="frozen"', $sheet);
        $this->assertStringContainsString('ySplit="1"', $sheet);
        $this->assertStringContainsString('<autoFilter ref="A1:B3"/>', $sheet);
        // Header cells carry the header style (s="1") and the label.
        $this->assertStringContainsString('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">ID</t></is></c>', $sheet);
        $this->assertStringContainsString('customWidth="1"', $sheet);
        // Sheet XML must be well-formed.
        $this->assertNotFalse(simplexml_load_string($sheet));
    }

    public function test_numbers_are_native_cells_and_strings_are_inline(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([
                ['header' => 'Total', 'type' => 'money'],
                ['header' => 'Name'],
            ]);
            $w->addRow([1250.50, 'Jane']);
        });

        $sheet = $this->zipPart($path, 'xl/worksheets/sheet1.xml');
        $this->assertStringContainsString('<v>1250.5</v>', $sheet);
        $this->assertStringContainsString('<is><t xml:space="preserve">Jane</t></is>', $sheet);
    }

    public function test_non_numeric_value_in_number_column_falls_back_to_string(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([['header' => 'Total', 'type' => 'money']]);
            $w->addRow(['n/a']);
        });

        $sheet = $this->zipPart($path, 'xl/worksheets/sheet1.xml');
        $this->assertStringNotContainsString('<v>n/a</v>', $sheet);
        $this->assertStringContainsString('<is><t xml:space="preserve">n/a</t></is>', $sheet);
    }

    public function test_escapes_xml_and_never_emits_formulas(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([['header' => 'Name & "Co" <x>']]);
            $w->addRow(['=cmd|/C calc!A1 & <b>"quote"</b>' . "\x07"]);
        });

        $sheet = $this->zipPart($path, 'xl/worksheets/sheet1.xml');
        // No <f> formula elements, injection payload stays literal text.
        $this->assertStringNotContainsString('<f>', $sheet);
        $this->assertStringContainsString('=cmd|/C calc!A1 &amp; &lt;b&gt;', $sheet);
        // Header escaped; control char stripped; XML still parses.
        $this->assertStringContainsString('Name &amp; &quot;Co&quot; &lt;x&gt;', $sheet);
        $this->assertNotFalse(simplexml_load_string($sheet));
    }

    public function test_empty_cells_are_emitted_with_style_for_continuous_zebra(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([['header' => 'A'], ['header' => 'B']]);
            $w->addRow(['x', null]);
            $w->addRow([null, 'y']); // zebra row
        });

        $sheet = $this->zipPart($path, 'xl/worksheets/sheet1.xml');
        $this->assertStringContainsString('<c r="B2" s="2"/>', $sheet);
        $this->assertStringContainsString('<c r="A3" s="3"/>', $sheet);
    }

    public function test_column_letters_past_z(): void
    {
        $this->assertSame('A', XlsxWriter::colLetter(0));
        $this->assertSame('Z', XlsxWriter::colLetter(25));
        $this->assertSame('AA', XlsxWriter::colLetter(26));
        $this->assertSame('AE', XlsxWriter::colLetter(30));
        $this->assertSame('BA', XlsxWriter::colLetter(52));
    }

    public function test_sheet_name_is_sanitized_for_excel(): void
    {
        $w = new XlsxWriter('Leads [2026/07]: *export?');
        $w->setColumns([['header' => 'A']]);
        $path = $w->toTempFile();
        $this->tempFiles[] = $path;

        $workbook = $this->zipPart($path, 'xl/workbook.xml');
        $this->assertStringNotContainsString('[', $workbook);
        $this->assertStringNotContainsString('/', htmlspecialchars_decode(
            preg_replace('/.*name="([^"]*)".*/', '$1', $workbook) ?? ''
        ));
        $this->assertNotFalse(simplexml_load_string($workbook));
    }

    public function test_styles_xml_is_well_formed_and_has_money_format(): void
    {
        $path = $this->build(function (XlsxWriter $w) {
            $w->setColumns([['header' => 'A']]);
        });

        $styles = $this->zipPart($path, 'xl/styles.xml');
        $this->assertNotFalse(simplexml_load_string($styles));
        $this->assertStringContainsString('formatCode="#,##0.00"', $styles);
        // Brand header: charcoal fill + gold underline.
        $this->assertStringContainsString('FF202430', $styles);
        $this->assertStringContainsString('FFB8953F', $styles);
    }
}
