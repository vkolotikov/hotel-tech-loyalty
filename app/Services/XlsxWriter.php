<?php

namespace App\Services;

use RuntimeException;
use ZipArchive;

/**
 * Minimal streaming XLSX writer for admin data exports — no composer
 * dependency (phpspreadsheet is ~20 MB of deploy weight for what is,
 * here, six small XML files inside a zip).
 *
 * Produces a single-sheet workbook styled to match the HexaTech admin:
 * dark header row with gold underline, frozen header, autofilter,
 * zebra-striped rows, per-column widths and number formats.
 *
 * Values are written as inline strings or raw numbers — never as
 * formulas — so spreadsheet-formula injection (`=cmd(...)` in a guest
 * name) is structurally impossible, which the old fputcsv() exports
 * could not guarantee.
 *
 * Usage:
 *   $x = new XlsxWriter('Leads');
 *   $x->setColumns([
 *       ['header' => 'ID',    'width' => 8,  'type' => 'number'],
 *       ['header' => 'Guest', 'width' => 24],
 *       ['header' => 'Value', 'width' => 14, 'type' => 'money'],
 *   ]);
 *   $x->addRow([1, 'Jane Doe', 1250.00]);
 *   return response()->download($x->toTempFile(), 'leads.xlsx', [
 *       'Content-Type' => XlsxWriter::MIME,
 *   ])->deleteFileAfterSend(true);
 */
class XlsxWriter
{
    public const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    /** Column types → (even-row style id, odd-row style id) in cellXfs. */
    private const TYPE_STYLES = [
        'text'   => [2, 3],
        'number' => [4, 5],
        'money'  => [6, 7],
        'wrap'   => [8, 9],
    ];

    private const HEADER_STYLE = 1;

    /** @var array<int, array{header:string, width:float, type:string}> */
    private array $columns = [];

    /** @var resource|null Buffered <row> XML while rows stream in. */
    private $rowBuffer = null;

    private int $rowCount = 0;

    public function __construct(private string $sheetName = 'Data')
    {
    }

    /**
     * @param array<int, array{header:string, width?:float|int, type?:string}> $columns
     *        type ∈ text (default) | number | money | wrap
     */
    public function setColumns(array $columns): void
    {
        $this->columns = array_map(fn(array $c) => [
            'header' => (string) $c['header'],
            'width'  => (float) ($c['width'] ?? 14),
            'type'   => isset(self::TYPE_STYLES[$c['type'] ?? '']) ? $c['type'] : 'text',
        ], array_values($columns));
    }

    /** @param array<int, mixed> $cells Positional, matching setColumns(). */
    public function addRow(array $cells): void
    {
        if (!$this->columns) {
            throw new RuntimeException('setColumns() must be called before addRow().');
        }
        if ($this->rowBuffer === null) {
            $this->rowBuffer = fopen('php://temp/maxmemory:8388608', 'r+');
        }

        $this->rowCount++;
        $rowIdx  = $this->rowCount + 1; // +1 — row 1 is the header
        $stripe  = $this->rowCount % 2; // 1 on 1st data row → white; zebra on evens
        $xml     = '<row r="' . $rowIdx . '">';

        foreach ($this->columns as $i => $col) {
            $ref   = self::cellRef($i, $rowIdx);
            $style = self::TYPE_STYLES[$col['type']][$stripe === 0 ? 1 : 0];
            $value = $cells[$i] ?? null;

            if ($value === null || $value === '') {
                // Emit the empty cell anyway so the zebra fill + row
                // border paint a continuous stripe, not a patchwork.
                $xml .= '<c r="' . $ref . '" s="' . $style . '"/>';
            } elseif (in_array($col['type'], ['number', 'money'], true) && is_numeric($value)) {
                $xml .= '<c r="' . $ref . '" s="' . $style . '"><v>' . $value . '</v></c>';
            } else {
                $xml .= '<c r="' . $ref . '" s="' . $style . '" t="inlineStr"><is><t xml:space="preserve">'
                    . self::esc((string) $value) . '</t></is></c>';
            }
        }

        fwrite($this->rowBuffer, $xml . '</row>');
    }

    /** Build the workbook and return the path of a temp .xlsx file. */
    public function toTempFile(): string
    {
        if (!$this->columns) {
            throw new RuntimeException('setColumns() must be called before toTempFile().');
        }

        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip  = new ZipArchive();
        if ($zip->open($path, ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException("Cannot open temp xlsx at {$path}");
        }

        $zip->addFromString('[Content_Types].xml', self::contentTypesXml());
        $zip->addFromString('_rels/.rels', self::rootRelsXml());
        $zip->addFromString('xl/workbook.xml', $this->workbookXml());
        $zip->addFromString('xl/_rels/workbook.xml.rels', self::workbookRelsXml());
        $zip->addFromString('xl/styles.xml', self::stylesXml());
        $zip->addFromString('xl/worksheets/sheet1.xml', $this->sheetXml());
        $zip->close();

        if ($this->rowBuffer !== null) {
            fclose($this->rowBuffer);
            $this->rowBuffer = null;
        }

        return $path;
    }

    /* ─── XML parts ────────────────────────────────────────────────── */

    private function sheetXml(): string
    {
        $lastCol  = self::colLetter(count($this->columns) - 1);
        $lastRow  = $this->rowCount + 1;
        $fullRef  = "A1:{$lastCol}{$lastRow}";

        $cols = '<cols>';
        foreach ($this->columns as $i => $col) {
            $n = $i + 1;
            $cols .= '<col min="' . $n . '" max="' . $n . '" width="' . $col['width'] . '" customWidth="1"/>';
        }
        $cols .= '</cols>';

        $header = '<row r="1" ht="26" customHeight="1">';
        foreach ($this->columns as $i => $col) {
            $header .= '<c r="' . self::cellRef($i, 1) . '" s="' . self::HEADER_STYLE . '" t="inlineStr">'
                . '<is><t xml:space="preserve">' . self::esc($col['header']) . '</t></is></c>';
        }
        $header .= '</row>';

        $rows = '';
        if ($this->rowBuffer !== null) {
            rewind($this->rowBuffer);
            $rows = stream_get_contents($this->rowBuffer);
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<dimension ref="' . $fullRef . '"/>'
            . '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'
            . '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
            . '</sheetView></sheetViews>'
            . '<sheetFormatPr defaultRowHeight="17"/>'
            . $cols
            . '<sheetData>' . $header . $rows . '</sheetData>'
            . '<autoFilter ref="' . $fullRef . '"/>'
            . '</worksheet>';
    }

    private function workbookXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="' . self::esc(self::safeSheetName($this->sheetName)) . '" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>';
    }

    private static function contentTypesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>';
    }

    private static function rootRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    private static function workbookRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';
    }

    /**
     * Style table. Brand palette: charcoal header #202430 with the
     * HexaTech gold (#B8953F, tailwind primary-600) as a medium
     * underline; zebra rows in warm off-white #F7F5F0; hairline row
     * dividers #E5E7EB; body text #1F2937.
     *
     * cellXfs index map (referenced from TYPE_STYLES / HEADER_STYLE):
     *   0 default · 1 header · 2/3 text · 4/5 number · 6/7 money
     *   (#,##0.00) · 8/9 wrapped text — even/odd = white/zebra.
     */
    private static function stylesXml(): string
    {
        $numFmts = '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>';

        $fonts = '<fonts count="2">'
            . '<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
            . '</fonts>';

        $fills = '<fills count="4">'
            . '<fill><patternFill patternType="none"/></fill>'
            . '<fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FF202430"/><bgColor rgb="FF202430"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFF7F5F0"/><bgColor rgb="FFF7F5F0"/></patternFill></fill>'
            . '</fills>';

        $borders = '<borders count="3">'
            . '<border><left/><right/><top/><bottom/><diagonal/></border>'
            . '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>'
            . '<border><left/><right/><top/><bottom style="medium"><color rgb="FFB8953F"/></bottom><diagonal/></border>'
            . '</borders>';

        $align   = '<alignment vertical="center"/>';
        $wrap    = '<alignment vertical="top" wrapText="1"/>';
        $cellXfs = '<cellXfs count="10">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>'
            // 1 — header
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="2" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            // 2/3 — text
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            . '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            // 4/5 — number
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            . '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            // 6/7 — money
            . '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            . '<xf numFmtId="164" fontId="0" fillId="3" borderId="1" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">' . $align . '</xf>'
            // 8/9 — wrapped text (notes)
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1">' . $wrap . '</xf>'
            . '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1">' . $wrap . '</xf>'
            . '</cellXfs>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . $numFmts . $fonts . $fills . $borders
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . $cellXfs
            . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            . '</styleSheet>';
    }

    /* ─── helpers ──────────────────────────────────────────────────── */

    /** 0 → A, 25 → Z, 26 → AA … */
    public static function colLetter(int $index): string
    {
        $letter = '';
        $index++;
        while ($index > 0) {
            $mod    = ($index - 1) % 26;
            $letter = chr(65 + $mod) . $letter;
            $index  = intdiv($index - $mod - 1, 26);
        }
        return $letter;
    }

    private static function cellRef(int $colIndex, int $row): string
    {
        return self::colLetter($colIndex) . $row;
    }

    /** XML-escape + strip chars that are illegal in XML 1.0. */
    private static function esc(string $v): string
    {
        $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $v) ?? '';
        return htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    /** Excel sheet names: max 31 chars, no []:*?/\ characters. */
    private static function safeSheetName(string $name): string
    {
        $name = str_replace(['[', ']', ':', '*', '?', '/', '\\'], ' ', $name);
        return mb_substr(trim($name) !== '' ? trim($name) : 'Data', 0, 31);
    }
}
