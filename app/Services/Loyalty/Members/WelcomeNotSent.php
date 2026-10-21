<?php

namespace App\Services\Loyalty\Members;

/**
 * The welcome email did not go out (MemberEnrolment::resendWelcome): the mail server refused it or could not be
 * reached. The cause is kept as the previous exception for the log and for the full admin's own answer; HexaTech
 * Loyalty answers with a code and never with the cause's words.
 */
final class WelcomeNotSent extends \RuntimeException
{
    public function __construct(\Throwable $cause)
    {
        parent::__construct('The welcome email could not be sent.', 0, $cause);
    }
}
