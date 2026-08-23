<?php

use App\Http\Controllers\Landing\LandingPageController;
use Illuminate\Support\Facades\Route;

/*
 * Public landing pages, on their own host.
 *
 * The host separation is the security control: the admin SPA keeps a
 * non-expiring, all-abilities Sanctum token in localStorage, and localStorage
 * is per-origin. Nothing here may ever serve the admin.
 *
 * These routes deliberately do NOT run the `web` middleware group. No session
 * is started, so no cookie is set before a visitor has consented to anything,
 * and there is no session for an XSS to ride.
 *
 * This file is registered BEFORE routes/web.php — see bootstrap/app.php. The
 * SPA catch-all at the end of web.php matches every path on every host, and
 * routes match in registration order, so being second here would mean never
 * matching at all.
 */
Route::domain(config('landing.host'))
    ->middleware(['landing.security', 'throttle:120,1,landing-page'])
    ->group(function () {
        Route::get('/{slug}', [LandingPageController::class, 'show'])
            ->where('slug', '[a-z0-9-]+')
            ->name('landing.show');

        // Digits only: the controller signature is `int $page`, and a
        // non-numeric segment would be a TypeError (a 500) rather than a 404.
        Route::get('/preview/{page}', [LandingPageController::class, 'preview'])
            ->where('page', '[0-9]+')
            ->middleware('signed')
            ->name('landing.preview');
    });
