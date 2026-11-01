<?php

// Prepended to every request of the full-coverage API server (api.sh): with FC_SERVER_NOW set, Laravel's clock
// (now(), Carbon) reads that instant, so what the server writes and works out from the time ("updated 10:48",
// "next 24 h", the audit log, appointments due so far) is the same in every run. Nothing outside the screenshot
// server loads this file.
$fcServerNow = getenv('FC_SERVER_NOW');
if (is_string($fcServerNow) && $fcServerNow !== '') {
    require_once dirname(__DIR__, 3) . '/vendor/autoload.php';
    \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse($fcServerNow));
    \Carbon\CarbonImmutable::setTestNow(\Carbon\CarbonImmutable::parse($fcServerNow));
}
