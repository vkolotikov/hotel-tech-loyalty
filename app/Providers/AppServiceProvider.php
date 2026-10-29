<?php

namespace App\Providers;

use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Event;
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

        // Suppression enforcement for EVERY outbound email, on every kind of
        // process: web requests send mail synchronously too (the welcome mail,
        // the booking confirmations, the settings test message), so this
        // listener must NOT sit inside the console-only block below.
        //
        // Registered on the event rather than inside the send sites because
        // there are ~26 of them across 18 files and only one currently consults
        // the compliance service. Returning false from a MessageSending
        // listener cancels the send, so this cannot be bypassed by a call site
        // added later — see App\Listeners\BlockSuppressedRecipients.
        //
        // Event discovery already registers this listener from its handle()
        // type-hint (and the framework keeps one entry, not two); the explicit
        // line states the intent and survives discovery being switched off.
        // SuppressionListenerRegistrationTest boots a web-shaped application
        // and checks the listener is there either way.
        Event::listen(MessageSending::class, \App\Listeners\BlockSuppressedRecipients::class);

    }
}
