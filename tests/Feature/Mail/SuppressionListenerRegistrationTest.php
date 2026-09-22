<?php

namespace Tests\Feature\Mail;

use App\Listeners\BlockSuppressedRecipients;
use Illuminate\Container\Container;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Facade;
use Tests\TestCase;

/**
 * The suppression listener must be registered for WEB requests, not only for
 * console processes.
 *
 * The first version registered it inside AppServiceProvider's console-only
 * block. On this framework version event discovery registers the listener
 * from its handle() type-hint anyway, in every kind of process, so nothing
 * was bypassed in practice — but that is a property of discovery staying
 * switched on, and no ordinary test can see a console-only registration,
 * because PHPUnit itself runs in console.
 *
 * This test boots a SECOND application instance with APP_RUNNING_IN_CONSOLE
 * forced to false, the way a web request sees it, and asks that instance
 * whether the listener is there — whichever mechanism put it there.
 */
class SuppressionListenerRegistrationTest extends TestCase
{
    public function test_the_listener_is_registered_when_the_app_is_not_running_in_console(): void
    {
        $previous = [
            'server' => $_SERVER['APP_RUNNING_IN_CONSOLE'] ?? null,
            'env'    => $_ENV['APP_RUNNING_IN_CONSOLE'] ?? null,
        ];

        $_SERVER['APP_RUNNING_IN_CONSOLE'] = 'false';
        $_ENV['APP_RUNNING_IN_CONSOLE']    = 'false';
        putenv('APP_RUNNING_IN_CONSOLE=false');

        try {
            $app = require base_path('bootstrap/app.php');
            $app->make(HttpKernel::class)->bootstrap();

            $this->assertFalse($app->runningInConsole(), 'The fixture did not produce a web-shaped application.');

            $this->assertTrue($this->listens($app['events']),
                'BlockSuppressedRecipients is not listening to MessageSending in a web process — '
                . 'synchronous sends from HTTP requests would bypass the suppression list.');
        } finally {
            foreach (['server', 'env'] as $which) {
                $key = $which === 'server' ? '_SERVER' : '_ENV';
                if ($previous[$which] === null) {
                    unset($GLOBALS[$key]['APP_RUNNING_IN_CONSOLE']);
                } else {
                    $GLOBALS[$key]['APP_RUNNING_IN_CONSOLE'] = $previous[$which];
                }
            }
            putenv('APP_RUNNING_IN_CONSOLE');

            // Hand the facades and the container back to the test's own app.
            Container::setInstance($this->app);
            Facade::clearResolvedInstances();
            Facade::setFacadeApplication($this->app);
        }
    }

    public function test_the_listener_is_registered_in_this_console_process_too(): void
    {
        $this->assertTrue($this->listens($this->app['events']));
    }

    /**
     * The dispatcher stores a class listener as "Class@method" (or as the
     * class alone on older versions); either form counts.
     */
    private function listens($dispatcher): bool
    {
        foreach ($dispatcher->getRawListeners()[MessageSending::class] ?? [] as $listener) {
            if (is_string($listener) && str_starts_with($listener, BlockSuppressedRecipients::class)) {
                return true;
            }
        }

        return false;
    }
}
