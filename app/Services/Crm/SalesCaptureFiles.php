<?php

namespace App\Services\Crm;

use App\Services\Content\ContentMediaLibrary;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use ZipArchive;

final class SalesCaptureFiles
{
    private const TYPES = [
        'pdf' => 'application/pdf',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'csv' => 'text/csv',
        'txt' => 'text/plain',
        'md' => 'text/markdown',
    ];

    private const OFFICE_PARTS = ['docx' => 'word/document.xml', 'xlsx' => 'xl/workbook.xml', 'pptx' => 'ppt/presentation.xml'];

    private const MAX_FILES = 3;

    public static function limits(): array
    {
        $systemRequest = ContentMediaLibrary::iniBytes((string) ini_get('post_max_size'));
        $total = min(10 * 1024 * 1024, $systemRequest > 0 ? max($systemRequest - 65536, 0) : PHP_INT_MAX);

        return [
            'count' => self::MAX_FILES,
            'each_bytes' => min(4 * 1024 * 1024, ContentMediaLibrary::maxUploadBytes(), $total),
            'total_bytes' => $total,
            'extensions' => array_keys(self::TYPES),
        ];
    }

    public static function read(array $files): array
    {
        $limits = self::limits();
        if (count($files) > $limits['count'] || array_sum(array_map(fn (UploadedFile $file) => (int) $file->getSize(), $files)) > $limits['total_bytes']) {
            throw ValidationException::withMessages(['attachments' => 'The selected files exceed the upload limit.']);
        }
        $inputs = [];
        foreach ($files as $index => $file) {
            $extension = strtolower($file->getClientOriginalExtension());
            if (! isset(self::TYPES[$extension]) || $file->getSize() > $limits['each_bytes']) {
                throw ValidationException::withMessages(["attachments.$index" => 'Choose a supported file within the upload limit.']);
            }
            $bytes = $file->get();
            if ($bytes === '' || ! self::valid($file, $extension, $bytes)) {
                throw ValidationException::withMessages(["attachments.$index" => 'This file could not be read.']);
            }
            $original = mb_scrub($file->getClientOriginalName());
            $title = trim((string) preg_replace('/[\x00-\x1f\x7f]/u', '', $original));
            $inputs[] = [
                'title' => mb_strcut($title, 0, 200) ?: 'Document.'.$extension,
                'extension' => $extension,
                'mime' => self::TYPES[$extension],
                'data' => base64_encode($bytes),
            ];
        }

        return $inputs;
    }

    private static function valid(UploadedFile $file, string $extension, string $bytes): bool
    {
        if ($extension === 'pdf') {
            return str_starts_with($bytes, '%PDF-');
        }
        if (isset(self::OFFICE_PARTS[$extension])) {
            return self::office($file->getPathname(), self::OFFICE_PARTS[$extension]);
        }

        return ! str_contains($bytes, "\0") && mb_check_encoding($bytes, 'UTF-8') && trim($bytes) !== '';
    }

    private static function office(string $path, string $part): bool
    {
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::RDONLY) !== true) {
            return false;
        }
        try {
            if ($zip->numFiles > 3000 || $zip->locateName('[Content_Types].xml') === false || $zip->locateName($part) === false) {
                return false;
            }
            $size = 0;
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $size += (int) ($zip->statIndex($index)['size'] ?? 0);
                if ($size > 30 * 1024 * 1024) {
                    return false;
                }
            }

            return true;
        } finally {
            $zip->close();
        }
    }
}
