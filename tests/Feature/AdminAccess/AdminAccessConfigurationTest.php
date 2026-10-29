<?php

namespace Tests\Feature\AdminAccess;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AdminAccessConfigurationTest extends TestCase
{
    public static function environments(): array
    {
        return [
            'old production report flag' => ['production', 'report', 'enforce'],
            'staging report flag' => ['staging', 'report', 'enforce'],
            'missing environment fails closed' => [null, 'report', 'enforce'],
            'unknown environment fails closed' => ['preview', 'report', 'enforce'],
            'local diagnostics' => ['local', 'report', 'report'],
            'test diagnostics' => ['testing', 'report', 'report'],
            'local default remains enforcement' => ['local', null, 'enforce'],
        ];
    }

    #[DataProvider('environments')]
    public function test_only_local_and_testing_allow_report_mode(?string $environment, ?string $mode, string $expected): void
    {
        $old = [];
        foreach (['APP_ENV' => $environment, 'ADMIN_ACCESS_MODE' => $mode] as $key => $value) {
            $old[$key] = [getenv($key), $_ENV[$key] ?? null, $_SERVER[$key] ?? null];
            if ($value === null) {
                putenv($key);
                unset($_ENV[$key], $_SERVER[$key]);
            } else {
                putenv($key . '=' . $value);
                $_ENV[$key] = $_SERVER[$key] = $value;
            }
        }
        try {
            $settings = require base_path('config/admin_access.php');
            $this->assertSame($expected, $settings['mode']);
        } finally {
            foreach ($old as $key => [$process, $env, $server]) {
                putenv($process === false ? $key : $key . '=' . $process);
                if ($env === null) unset($_ENV[$key]); else $_ENV[$key] = $env;
                if ($server === null) unset($_SERVER[$key]); else $_SERVER[$key] = $server;
            }
        }
    }
}
