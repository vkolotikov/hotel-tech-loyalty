<?php

// Common bootstrap for the rehearsal HTTP server and worker. Never use this entry point in production.
if (getenv('APP_ENV') !== 'local' || getenv('DB_DATABASE') !== 'loyalty_launch_demo'
    || getenv('DB_HOST') !== '127.0.0.1' || getenv('DB_PORT') !== '55459'
    || getenv('MAIL_MAILER') !== 'log' || getenv('QUEUE_CONNECTION') !== 'database') {
    throw new RuntimeException('The isolated rehearsal environment is required.');
}
$launchRoot = dirname(__DIR__, 2);
require_once $launchRoot . '/vendor/autoload.php';
require __DIR__ . '/launch-clock.php';
$launchApp = require $launchRoot . '/bootstrap/app.php';
$launchApp->booted(static function (): void {
    // Provider requests fail locally rather than falling through to a developer's configured SaaS/API accounts.
    \Illuminate\Support\Facades\Http::preventStrayRequests();
});

return $launchApp;
