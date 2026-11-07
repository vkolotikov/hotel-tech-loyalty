<?php

namespace App\Exceptions;

/**
 * GuestMergeService refuses a merge (2026-11-08), with a code the caller answers beside the sentence: `same_guest`,
 * `different_organizations`, `different_members`. Still an InvalidArgumentException, so every caller that caught one
 * before still does.
 */
final class GuestMergeRefused extends \InvalidArgumentException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}
