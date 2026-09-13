<?php

namespace App\Voice\Alexa;

use RuntimeException;

/** A request that did not provably come from Alexa. The endpoint answers 400. */
class AlexaVerificationException extends RuntimeException {}
