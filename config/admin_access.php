<?php

/*
 * The admin access map's mode (Part C spec §5.4). `report` (the default, and
 * any value but `enforce`): the role and deactivation rules record what they
 * would refuse and let the call through. `enforce`: they refuse. The
 * Appointments plan's lock (not_in_plan) refuses in both. Switched in
 * Laravel Cloud with ADMIN_ACCESS_MODE; `php artisan admin-access:report`
 * shows the evidence first.
 */
return [
    'mode' => env('ADMIN_ACCESS_MODE', 'report'),
];
