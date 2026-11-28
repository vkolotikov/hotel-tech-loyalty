<?php

namespace App\Exceptions;

use RuntimeException;

final class CrmAssistantGenerationFailed extends RuntimeException
{
    public function __construct(public readonly string $stage, public readonly string $reason, public readonly ?int $httpStatus = null)
    {
        parent::__construct('The CRM assistant could not complete the '.$stage.' stage.');
    }
}
