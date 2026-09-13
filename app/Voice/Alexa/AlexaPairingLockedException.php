<?php

namespace App\Voice\Alexa;

use RuntimeException;

/** Too many wrong pairing codes from one Amazon account; claiming is paused. */
class AlexaPairingLockedException extends RuntimeException {}
