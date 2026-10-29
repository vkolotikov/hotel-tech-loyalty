<?php

namespace Tests\Feature\Settings;

use App\Models\ScheduledCommandRun;
use Illuminate\Console\Events\ScheduledBackgroundTaskFinished;
use Illuminate\Console\Events\ScheduledTaskFinished;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ScheduleReportingTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        if (!Schema::hasTable('scheduled_command_runs')) {
            Schema::create('scheduled_command_runs', function ($table) {
                $table->id();
                $table->string('command');
                $table->string('expression')->nullable();
                $table->string('status', 32);
                $table->integer('duration_ms')->nullable();
                $table->text('output_excerpt')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function test_the_real_scheduler_records_success_failure_and_skip_without_manual_provider_registration(): void
    {
        $schedule = new Schedule('UTC');
        $schedule->call(fn () => true)->name('reporting-success')->everyMinute();
        $schedule->call(fn () => false)->name('reporting-exit-failure')->everyMinute();
        $schedule->call(function () { throw new \RuntimeException('private test credential'); })
            ->name('reporting-exception')->everyMinute();
        $schedule->call(fn () => true)->name('reporting-skipped')->everyMinute()->when(fn () => false);
        $this->app->instance(Schedule::class, $schedule);

        Artisan::call('schedule:run');

        $rows = ScheduledCommandRun::where('command', 'like', 'reporting-%')->orderBy('id')->get();
        $this->assertCount(4, $rows);
        $this->assertSame([
            'reporting-success' => 'success', 'reporting-exit-failure' => 'failed',
            'reporting-exception' => 'failed', 'reporting-skipped' => 'skipped',
        ], $rows->pluck('status', 'command')->all());
        $this->assertStringNotContainsString('private test credential', $rows->toJson());
        $this->assertSame('* * * * *', $rows->first()->expression);
        $this->assertNotNull($rows->first()->finished_at);
    }

    public function test_background_dispatch_is_not_reported_as_success_before_completion(): void
    {
        $task = (new Schedule('UTC'))->command('inspire')->runInBackground();
        Event::dispatch(new ScheduledTaskFinished($task, 0.01));
        $this->assertSame(0, ScheduledCommandRun::where('command', 'inspire')->count());

        $task->exitCode = 1;
        Event::dispatch(new ScheduledBackgroundTaskFinished($task));
        $this->assertSame('failed', ScheduledCommandRun::where('command', 'inspire')->sole()->status);
    }

    public function test_heartbeat_keeps_its_independent_single_record_and_command_arguments_are_not_stored(): void
    {
        $task = (new Schedule('UTC'))->call(fn () => true)->name('heartbeat');
        $task->exitCode = 0;
        Event::dispatch(new ScheduledTaskFinished($task, 0.01));
        $this->assertSame(0, ScheduledCommandRun::where('command', 'heartbeat')->count());

        $command = (new Schedule('UTC'))->command('loyalty:send-scheduled --private=do-not-store');
        $command->exitCode = 0;
        Event::dispatch(new ScheduledTaskFinished($command, 0.02));
        $row = ScheduledCommandRun::where('command', 'loyalty:send-scheduled')->sole();
        $this->assertSame(20, $row->duration_ms);
        $this->assertStringNotContainsString('do-not-store', $row->toJson());
    }
}
