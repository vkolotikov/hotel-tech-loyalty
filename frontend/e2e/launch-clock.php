<?php

// Opt-in clock for this isolated rehearsal only; never loaded by a normal application request.
$launchClock = getenv('LAUNCH_CLOCK_FILE');
if ($launchClock && getenv('APP_ENV') === 'local' && getenv('DB_DATABASE') === 'loyalty_launch_demo') {
    $instant = trim((string) @file_get_contents($launchClock));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $instant)) {
        throw new RuntimeException('A valid isolated rehearsal clock is required.');
    }
    require_once dirname(__DIR__, 2) . '/vendor/autoload.php';
    \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse($instant));
    \Carbon\CarbonImmutable::setTestNow(\Carbon\CarbonImmutable::parse($instant));
}
