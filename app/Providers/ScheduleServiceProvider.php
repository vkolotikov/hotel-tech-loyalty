<?php

namespace App\Providers;

use App\Models\ScheduledCommandRun;
use Illuminate\Console\Events\ScheduledBackgroundTaskFinished;
use Illuminate\Console\Events\ScheduledTaskFailed;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Console\Events\ScheduledTaskSkipped;
use Illuminate\Console\Scheduling\Event as ScheduledEvent;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

/** Registered in bootstrap/providers.php; AppServiceProvider is not loaded by this application. */
final class ScheduleServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if (!$this->app->runningInConsole()) {
            return;
        }

        Event::listen(ScheduledTaskFinished::class, function (ScheduledTaskFinished $event): void {
            // Background completion arrives in a different process. Non-zero foreground exits are followed by
            // ScheduledTaskFailed, so neither should produce a premature or duplicate success record here.
            if (!$event->task->runInBackground && $event->task->exitCode === 0) {
                $this->record($event->task, 'success', $event->runtime);
            }
        });
        Event::listen(ScheduledTaskFailed::class, function (ScheduledTaskFailed $event): void {
            // Exception messages can contain SQL bindings, credentials or member details. The operator gets the
            // failed command and exception type; sensitive output is never copied into this status table.
            $this->record($event->task, 'failed', $event->runtime ?? null, 'Task failed (' . $event->exception::class . ').');
        });
        Event::listen(ScheduledTaskSkipped::class, fn (ScheduledTaskSkipped $event) => $this->record($event->task, 'skipped'));
        Event::listen(ScheduledBackgroundTaskFinished::class, function (ScheduledBackgroundTaskFinished $event): void {
            $success = $event->task->exitCode === 0;
            $this->record($event->task, $success ? 'success' : 'failed', null,
                $success ? null : 'Task exited with code ' . (int) $event->task->exitCode . '.');
        });
    }

    private function record(ScheduledEvent $task, string $status, ?float $seconds = null, ?string $failure = null): void
    {
        $command = (string) ($task->command ?? '');
        $name = preg_match("/artisan['\"]?\s+([\w:\-]+)/", $command, $match)
            ? $match[1] : (string) ($task->description ?: 'scheduled-callback');
        if ($name === 'heartbeat') {
            return; // Its closure deliberately records independently of scheduler events.
        }

        $duration = $seconds === null ? null : max(0, (int) round($seconds * 1000));
        try {
            ScheduledCommandRun::create([
                'command' => mb_substr($name, 0, 191),
                'expression' => $task->expression,
                'status' => $status,
                'duration_ms' => $duration,
                'output_excerpt' => $failure,
                'started_at' => now()->subMilliseconds($duration ?? 0),
                'finished_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Monitoring must not prevent the next real task from running.
            Log::warning('Could not record scheduled task outcome.', ['command' => $name, 'status' => $status, 'exception' => $e::class]);
        }
    }
}
