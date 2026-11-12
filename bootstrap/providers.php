<?php

use App\Providers\CrmIntakeTokensServiceProvider;
use App\Providers\PluginServiceProvider;
use App\Providers\ScheduleServiceProvider;

return [
    PluginServiceProvider::class,
    ScheduleServiceProvider::class,
    // CRM round 5 (2026-11-12): a lead-intake API token reaches only POST integrations/leads.
    CrmIntakeTokensServiceProvider::class,
];
