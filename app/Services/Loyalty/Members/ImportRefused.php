<?php

namespace App\Services\Loyalty\Members;

/**
 * A member import refused before anything was kept (MemberImportRun::preview): a code HexaTech Loyalty turns into its
 * own words, a sentence the full admin's import shows as it always has, and what the code needs beside it (the
 * columns found, the file's rows). Each caller answers it in its own shape.
 */
final class ImportRefused extends \RuntimeException
{
    /** @param array<string, mixed> $extra */
    public function __construct(public readonly string $errorCode, string $message, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}
