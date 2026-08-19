<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Find .env values that will break — and LEAK — when the file is sourced.
 *
 * WHY THIS EXISTS
 * The deploy pipeline sources .env as a shell script before running the build
 * commands. A value containing an unquoted space, bracket or other shell
 * metacharacter is therefore not data, it is syntax:
 *
 *     API_TOKEN=abc 8hsWI66Cof…       →  sh: 8hsWI66Cof…: command not found
 *
 * The shell reads `API_TOKEN=abc` as a one-off assignment and everything after
 * the space as the COMMAND to run. Two consequences, and the second is the bad
 * one: sourcing aborts, so every variable defined after that line is silently
 * missing for the whole build — and the failed "command" is echoed into the
 * build log, which is where a live credential ends up in plain text.
 *
 * This command reports the KEYS at risk and never prints their values, so it
 * is safe to run and safe to paste. Any key it names should be wrapped in
 * double quotes in the platform's environment editor.
 */
class LintEnvForShellSafety extends Command
{
    protected $signature = 'env:lint {path=.env : Path to the env file to check}';

    protected $description = 'Report .env keys whose values would break shell sourcing (and leak into build logs)';

    /** Characters that make a value shell syntax rather than shell data. */
    private const UNSAFE = [
        ' '  => 'space',
        '('  => 'bracket',
        ')'  => 'bracket',
        '$'  => 'expansion',
        '`'  => 'command substitution',
        '&'  => 'control operator',
        '|'  => 'pipe',
        ';'  => 'separator',
        '<'  => 'redirect',
        '>'  => 'redirect',
        '*'  => 'glob',
        '!'  => 'history expansion',
    ];

    public function handle(): int
    {
        $path = $this->argument('path');

        if (!is_file($path)) {
            $this->error("No such file: {$path}");
            return self::FAILURE;
        }

        $problems = [];

        foreach (file($path, FILE_IGNORE_NEW_LINES) as $i => $line) {
            $trimmed = ltrim($line);

            if ($trimmed === '' || str_starts_with($trimmed, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $key   = trim($key);
            $value = trim($value);

            // Already quoted end-to-end: the shell treats it as one word.
            $quoted = strlen($value) >= 2
                && (($value[0] === '"' && str_ends_with($value, '"'))
                 || ($value[0] === "'" && str_ends_with($value, "'")));

            if ($quoted || $value === '') {
                continue;
            }

            $found = [];
            foreach (self::UNSAFE as $char => $label) {
                if (str_contains($value, $char)) {
                    $found[$label] = true;
                }
            }

            if ($found !== []) {
                $problems[] = ['line' => $i + 1, 'key' => $key, 'why' => implode(', ', array_keys($found))];
            }
        }

        if ($problems === []) {
            $this->info("No shell-unsafe values in {$path}.");
            return self::SUCCESS;
        }

        $this->warn("These values will break sourcing and may be echoed into build logs.");
        $this->warn("Wrap each in double quotes in your environment editor. Values are not shown.");
        $this->newLine();

        $this->table(
            ['Line', 'Key', 'Contains'],
            array_map(fn ($p) => [$p['line'], $p['key'], $p['why']], $problems),
        );

        $this->newLine();
        $this->line('Everything defined AFTER the first offending line is missing during the build.');

        return self::FAILURE;
    }
}
