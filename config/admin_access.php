<?php

/*
 * Production and staging always enforce the access map, including when an
 * old Cloud variable still says report. Local and testing environments may
 * explicitly report refusals without blocking for diagnostics. Unknown mode
 * values fail closed. The Appointments plan's lock refuses in both modes.
 * `php artisan admin-access:report` reads the recorded refusals in either mode.
 */
return [
    'mode' => in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)
        ? env('ADMIN_ACCESS_MODE', 'enforce')
        : 'enforce',
];
