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

// SPA fallback — serve the React admin panel for any non-API route
Route::get('/{any}', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
})->where('any', '^(?!api/|storage/|spa/|widget/|booking-widget).*$');

Route::get('/', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
});
