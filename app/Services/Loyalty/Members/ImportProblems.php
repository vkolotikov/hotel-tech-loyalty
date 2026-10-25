<?php

namespace App\Services\Loyalty\Members;

use App\Services\MemberImportService;

/**
 * What MemberImportService says about a row, as a code HexaTech Loyalty puts into its own words (spec 2026-10-21
 * release 2 §4.1): the service writes English sentences for the full admin's import, which shows them as they are;
 * the workspace never shows the server's English. Each sentence the service writes has a code here
 * (ImportTest pins every one); a sentence this list does not know reads as `other`.
 */
final class ImportProblems
{
    /** The service's sentences, as patterns, and the code each one is. */
    private const PATTERNS = [
        '/^No email address in this row$/'                => 'no_email',
        '/^No name in this row$/'                         => 'no_name',
        '/^That email address is not valid$/'             => 'bad_email',
        '/^Appears earlier in this file \(line (\d+)\)$/' => 'repeated',
        '/^Already a member$/'                            => 'already_member',
        "/^No tier called '(.*)'\\. Available: /s"        => 'unknown_tier',
        '/^Over your plan member limit/'                  => 'member_limit',
        '/^Could not create: /'                           => 'not_created',
        '/^Could not read this row /'                     => 'unreadable',
        // Release 8: a membership end date that is not a day.
        '/^The membership end date \'.*\' is not a day written YYYY-MM-DD$/s' => 'bad_valid_until',
    ];

    /**
     * One problem row, as the workspace reads it: the line, the email, whether it was refused or passed over, the
     * code, and what the code's sentence names (`first_line` for a repeated address, `tier` for an unknown tier).
     *
     * @param array{line?: int, email?: string, status?: string, reason?: string} $row
     * @return array{line: int, email: string, kind: string, code: string, first_line?: int, tier?: string}
     */
    public static function of(array $row): array
    {
        $out = [
            'line'  => (int) ($row['line'] ?? 0),
            'email' => (string) ($row['email'] ?? ''),
            'kind'  => ($row['status'] ?? 'error') === 'skip' ? 'skipped' : 'refused',
            'code'  => 'other',
        ];
        $reason = (string) ($row['reason'] ?? '');
        foreach (self::PATTERNS as $pattern => $code) {
            if (preg_match($pattern, $reason, $m)) {
                $out['code'] = $code;
                if ($code === 'repeated') {
                    $out['first_line'] = (int) $m[1];
                }
                if ($code === 'unknown_tier') {
                    $out['tier'] = mb_substr($m[1], 0, 100);
                }
                break;
            }
        }

        return $out;
    }

    /**
     * The rows of a preview or a batch that were not imported, in the workspace's shape, at most `$limit`.
     *
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    public static function list(array $rows, int $limit = 100): array
    {
        $out = [];
        foreach ($rows as $row) {
            if (($row['status'] ?? 'error') === 'ok') {
                continue;
            }
            $out[] = self::of($row);
            if (count($out) >= $limit) {
                break;
            }
        }

        return $out;
    }

    /**
     * The columns an import understands, from the service's own list (MemberImportService::ALIASES), so the
     * workspace can name them without keeping a copy. @return list<string>
     */
    public static function columns(): array
    {
        return array_keys((new \ReflectionClassConstant(MemberImportService::class, 'ALIASES'))->getValue());
    }
}
