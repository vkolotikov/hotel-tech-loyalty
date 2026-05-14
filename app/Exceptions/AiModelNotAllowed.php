<?php

namespace App\Exceptions;

/**
 * Thrown by AI service entry points when the org's plan doesn't include
 * the model they're trying to use. Caller should surface a clear admin-
 * visible error (typically by upgrading their plan).
 */
class AiModelNotAllowed extends \RuntimeException
{
    public function __construct(public readonly string $model, public readonly array $allowed)
    {
        $allowedList = empty($allowed) ? 'none' : implode(', ', $allowed);
        parent::__construct("Model '{$model}' not included in this plan. Allowed: {$allowedList}.");
    }
}
