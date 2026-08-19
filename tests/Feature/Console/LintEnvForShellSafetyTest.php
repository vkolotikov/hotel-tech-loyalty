<?php

namespace Tests\Feature\Console;

use Tests\TestCase;

/**
 * The linter that finds .env values which are shell syntax rather than data.
 *
 * The failure it exists to catch cost a live credential: the deploy pipeline
 * sources .env, a token containing a space was parsed as `KEY=firstword` plus a
 * command, and the shell echoed the rest of the token into the build log as
 * "command not found". Sourcing then aborted, so every variable below that line
 * was missing for the whole build too.
 *
 * The test that matters most is the last one: this tool must never print a
 * value, or running it would reproduce the leak it is meant to prevent.
 */
class LintEnvForShellSafetyTest extends TestCase
{
    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        $this->path = sys_get_temp_dir() . '/env-lint-' . uniqid() . '.env';
    }

    protected function tearDown(): void
    {
        @unlink($this->path);
        parent::tearDown();
    }

    private function write(string $contents): void
    {
        file_put_contents($this->path, $contents);
    }

    public function test_a_clean_file_passes(): void
    {
        $this->write("APP_NAME=\"Hotel Loyalty\"\nAPP_ENV=production\n# a comment\n\nMAIL_PORT=587\n");

        $this->artisan('env:lint', ['path' => $this->path])
            ->expectsOutputToContain('No shell-unsafe values')
            ->assertExitCode(0);
    }

    public function test_a_value_with_a_space_is_reported(): void
    {
        // Exactly the shape that leaked: the shell runs everything after the
        // space as a command and prints it.
        $this->write("API_TOKEN=abc def123\n");

        $this->artisan('env:lint', ['path' => $this->path])
            ->expectsOutputToContain('API_TOKEN')
            ->assertExitCode(1);
    }

    public function test_brackets_and_other_metacharacters_are_reported(): void
    {
        $this->write("MAIL_PASSWORD=V2Kq428)gm\nOTHER=a\$b\nTHIRD=x|y\n");

        $this->artisan('env:lint', ['path' => $this->path])
            ->expectsOutputToContain('MAIL_PASSWORD')
            ->expectsOutputToContain('OTHER')
            ->expectsOutputToContain('THIRD')
            ->assertExitCode(1);
    }

    public function test_quoted_values_are_accepted(): void
    {
        // Quoting is the fix, so a quoted value must stop being reported —
        // otherwise the tool would nag forever and get ignored.
        $this->write("MAIL_PASSWORD=\"V2Kq428)gm\"\nAPI_TOKEN='abc def123'\n");

        $this->artisan('env:lint', ['path' => $this->path])
            ->expectsOutputToContain('No shell-unsafe values')
            ->assertExitCode(0);
    }

    public function test_it_never_prints_the_value(): void
    {
        // The whole point. A linter that echoes secrets to find leaked secrets
        // is the bug wearing a different hat.
        $secret = 'sup3rSecretValue987';
        $this->write("API_TOKEN=abc {$secret}\n");

        $this->artisan('env:lint', ['path' => $this->path])
            ->doesntExpectOutputToContain($secret)
            ->assertExitCode(1);
    }

    public function test_a_missing_file_fails_cleanly(): void
    {
        $this->artisan('env:lint', ['path' => $this->path . '.nope'])
            ->assertExitCode(1);
    }
}
