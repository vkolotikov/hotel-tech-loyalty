<?php

use App\Http\Controllers\ApiDocsController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// ─── API Documentation ──────────────────────────────────────────────────────
Route::get('/api/docs',          [ApiDocsController::class, 'ui']);
Route::get('/api/docs/spec.json',[ApiDocsController::class, 'spec']);

// Serve uploaded files from storage (works without public/storage symlink)
Route::get('/storage/{path}', function (string $path) {
    if (Storage::disk('public')->exists($path)) {
        return Storage::disk('public')->response($path);
    }
    abort(404);
})->where('path', '.*');

// ─── Public Booking Widget (embeddable) ─────────────────────────────────────
Route::get('/booking-widget', function (\Illuminate\Http\Request $request) {
    $orgId = $request->query('org', '');
    $lang  = $request->query('lang', 'en');
    $color = $request->query('color', '');

    // Build the API base URL relative to this server
    $apiBase = rtrim(url('/'), '/') . '/api';

    return view('booking-widget', compact('orgId', 'lang', 'color', 'apiBase'));
});

// ─── Public Services Reservation Widget (embeddable) ───────────────────────
Route::get('/services-widget', function (\Illuminate\Http\Request $request) {
    $orgId = $request->query('org', '');
    $lang  = $request->query('lang', 'en');
    $color = $request->query('color', '');

    $apiBase = rtrim(url('/'), '/') . '/api';

    return response()
        ->view('services-widget', compact('orgId', 'lang', 'color', 'apiBase'))
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
});

// ─── Standalone Services Booking Page ──────────────────────────────────────
Route::get('/services/{token}', function (string $token) {
    $org = \App\Models\Organization::where('widget_token', $token)->first();
    if (!$org) {
        abort(404, 'Services booking page not found');
    }
    $color = request('color', '');
    if (!$color) {
        $color = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('key', 'services_widget_color')
            ->value('value')
            ?: \App\Models\HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $org->id)
                ->where('key', 'primary_color')
                ->value('value')
            ?: '';
    }
    $apiBase = url('/') . '/api';
    return view('services-widget', [
        'orgId'  => $token,
        'lang'   => request('lang', 'en'),
        'color'  => $color,
        'apiBase' => $apiBase,
        'standalone' => true,
    ]);
});

// ─── Standalone Booking Page ────────────────────────────────────────────────
Route::get('/book/{token}', function (string $token) {
    $org = \App\Models\Organization::where('widget_token', $token)->first();
    if (!$org) {
        abort(404, 'Booking page not found');
    }
    // Resolve brand color from appearance settings
    $color = request('color', '');
    if (!$color) {
        $color = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('key', 'primary_color')
            ->value('value') ?: '';
    }
    $apiBase = url('/') . '/api';
    return view('booking-widget', [
        'orgId'  => $token,
        'lang'   => request('lang', 'en'),
        'color'  => $color,
        'apiBase' => $apiBase,
        'standalone' => true,
    ]);
});

// ─── Public Review Page (tokenized + embed-key) ─────────────────────────────
// Token flow: /review/t/{token}  (personalised invitation link)
// Embed flow: /review/{formId}?key=...  (anonymous / iframe)
Route::get('/review/t/{token}', function (string $token) {
    $apiBase = rtrim(url('/'), '/') . '/api';
    return response()
        ->view('review-form', [
            'mode' => 'token',
            'key'  => ['token' => $token],
            'apiBase' => $apiBase,
            'color' => request('color', ''),
        ])
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
});

Route::get('/review/{id}', function (int $id, \Illuminate\Http\Request $request) {
    $apiBase = rtrim(url('/'), '/') . '/api';
    return response()
        ->view('review-form', [
            'mode' => 'embed',
            'key'  => ['id' => $id, 'key' => (string) $request->query('key', '')],
            'apiBase' => $apiBase,
            'color' => $request->query('color', ''),
        ])
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
})->where('id', '[0-9]+');

// SPA fallback — serve the React admin panel for any non-API route
Route::get('/{any}', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
})->where('any', '^(?!api/|storage/|spa/|widget/|booking-widget|book/|services-widget|services/|review/).*$');

Route::get('/', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
});
