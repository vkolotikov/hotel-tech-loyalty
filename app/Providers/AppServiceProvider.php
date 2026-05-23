<?php

namespace App\Providers;

use App\Models\ScheduledCommandRun;
use Illuminate\Console\Events\ScheduledTaskFailed;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Console\Events\ScheduledTaskSkipped;
use Illuminate\Console\Events\ScheduledTaskStarting;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Default value for tenant scope — overridden by TenantMiddleware per request
        $this->app->instance('current_organization_id', null);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Schema::defaultStringLength(191);

        // Only attach scheduler observers when running in console — there is
        // no point paying the listener-registration cost on every HTTP request.
        if ($this->app->runningInConsole()) {
            $this->registerScheduleObservers();
        }
    }

    /**
     * Capture every scheduled-command outcome into `scheduled_command_runs`
     * so `diag:scheduled-health` can answer "is any cron silently dead?"
     * without grepping audit logs by hand.
     *
     * Only Finished / Failed / Skipped are observed — not Starting — so the
     * row write is atomic and we can't end up with stuck 'started' half-rows
     * if a worker crashes mid-run. Trade-off: a still-running command isn't
     * visible until it finishes, which is fine for a health check.
     */
    private function registerScheduleObservers(): void
    {
        $extract = static function (string $shellCommand): string {
            // Schedule events expose the full shell command (`'/usr/bin/php'
            // 'artisan' bookings:sync-pms --foo`). Pull out just the artisan
            // command name so the diag table is readable.
            if (preg_match("/artisan['\"]?\s+([\w:\-]+)/", $shellCommand, $m)) {
                return $m[1];
            }
            return mb_substr($shellCommand, 0, 191);
        };

        // Starting listener — purely diagnostic. Doesn't write a row,
        // but emits a log line so we can confirm the scheduler is
        // dispatching events at all. If laravel.log shows "[sched]
        // starting…" lines but no Finished follow-ups, that
        // narrows the bug to event dispatch vs row write.
        Event::listen(ScheduledTaskStarting::class, function ($event) use ($extract) {
            Log::info('[sched] starting: ' . $extract($event->task->command ?? ''));
        });

        Event::listen(ScheduledTaskFinished::class, function ($event) use ($extract) {
            $cmd = $extract($event->task->command ?? '');
            Log::info('[sched] finished: ' . $cmd);
            try {
                $durationMs = (int) round(($event->runtime ?? 0) * 1000);
                ScheduledCommandRun::create([
                    'command'     => $cmd,
                    'expression'  => $event->task->expression ?? null,
                    'status'      => 'success',
                    'duration_ms' => $durationMs,
                    'started_at'  => now()->subMilliseconds($durationMs),
                    'finished_at' => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('[sched] failed to log finish', ['cmd' => $cmd, 'error' => $e->getMessage()]);
            }
        });

        Event::listen(ScheduledTaskFailed::class, function ($event) use ($extract) {
            $cmd = $extract($event->task->command ?? '');
            Log::info('[sched] failed: ' . $cmd);
            try {
                ScheduledCommandRun::create([
                    'command'        => $cmd,
                    'expression'     => $event->task->expression ?? null,
                    'status'         => 'failed',
                    'started_at'     => now(),
                    'finished_at'    => now(),
                    'output_excerpt' => mb_substr($event->exception?->getMessage() ?? 'unknown', 0, 2000),
                ]);
            } catch (\Throwable $e) {
                Log::warning('[sched] failed to log failure', ['cmd' => $cmd, 'error' => $e->getMessage()]);
            }
        });

        Event::listen(ScheduledTaskSkipped::class, function ($event) use ($extract) {
            $cmd = $extract($event->task->command ?? '');
            Log::info('[sched] skipped (overlapping?): ' . $cmd);
            try {
                ScheduledCommandRun::create([
                    'command'     => $cmd,
                    'expression'  => $event->task->expression ?? null,
                    'status'      => 'skipped',
                    'started_at'  => now(),
                    'finished_at' => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('[sched] failed to log skip', ['cmd' => $cmd, 'error' => $e->getMessage()]);
            }
        });
    }
}
