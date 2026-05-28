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

// ─── Chat widget JS — minified + long-cached ─────────────────────────────
// Served via Laravel (not the static file in public/widget/) so we can
// attach a 1-year Cache-Control header + ETag + minify on the fly.
// Lighthouse flagged the hand-written source as missing both — fixing
// each saves ~8 KiB on the wire and lets repeat visitors hit cache.
// Embed loader points at /w/chat.js?v={mtime}; the original static
// file stays in place as a fallback (and for local dev).
Route::get('/w/chat.js', function () {
    $src = public_path('widget/hotel-chat.js');
    if (!is_file($src)) abort(404);

    $mtime = filemtime($src);
    $etag  = '"' . substr(md5($mtime . filesize($src)), 0, 16) . '"';

    // 304 if the browser already has it.
    if (request()->headers->get('If-None-Match') === $etag) {
        return response('', 304)->header('ETag', $etag);
    }

    $cacheKey = 'widget:chat:min:' . $mtime;
    $body = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60 * 60 * 24 * 30, function () use ($src) {
        $code = file_get_contents($src);
        // Minify conservatively: strip /* */ block comments, // line
        // comments (but NOT inside strings/regex), collapse whitespace.
        // We DON'T mangle identifiers — the script is hand-written and
        // names like state, render, applyColor matter for debugging.
        // Block comments outside strings.
        $code = preg_replace('#/\*(?!\!)[\s\S]*?\*/#', '', $code);
        // Line comments — only when the // is preceded by whitespace
        // or start-of-line (avoids hitting URLs like https://).
        $code = preg_replace('#(^|[\s;{}])//[^\n\r]*#m', '$1', $code);
        // Collapse runs of whitespace, leaving single spaces and one
        // newline per statement so error stack traces stay readable.
        $code = preg_replace("/[ \t]+/", ' ', $code);
        $code = preg_replace('/\n{2,}/', "\n", $code);
        // Squeeze spaces around safe punctuators.
        $code = preg_replace('/\s*([{};,:()\[\]])\s*/', '$1', $code);
        return ltrim($code);
    });

    return response($body, 200, [
        'Content-Type'  => 'application/javascript; charset=utf-8',
        'Cache-Control' => 'public, max-age=31536000, immutable',
        'ETag'          => $etag,
        // Allow embedding from any origin (the widget runs on the
        // customer's website, not on ours).
        'Access-Control-Allow-Origin' => '*',
    ]);
});

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
    // Resolve token via brands first; falls back to legacy orgs.widget_token.
    // Side-effect: binds current_organization_id + current_brand_id so any
    // brand-scoped models (ChatWidgetConfig, KB, etc.) auto-filter correctly.
    $brand = \App\Models\Brand::resolveByToken($token);
    if (!$brand) {
        abort(404, 'Services booking page not found');
    }
    $org = $brand->organization;
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

// ─── Standalone Chat Widget Page (mobile WebView host) ────────────────────
// Renders a full-screen chat panel using the org's ChatWidgetConfig.
// Used by the member mobile app's Contact screen — a WebView loads this URL
// keyed by the org's widget_token (the same token used by booking/services
// widgets). Optional prefill_name / prefill_email / prefill_phone query
// params auto-capture visitor identity via the /lead endpoint so the
// conversation is tied to the member from the first message.
Route::get('/chat-widget/{token}', function (string $token) {
    // Resolve to a brand (binds org + brand context for downstream lookups).
    $brand = \App\Models\Brand::resolveByToken($token);
    if (!$brand) {
        abort(404, 'Chat widget not found');
    }
    $org = $brand->organization;
    // Pick the brand-scoped widget config when one exists, otherwise the
    // org's first config (covers the transition period before per-brand
    // configs are created).
    $cfg = \App\Models\ChatWidgetConfig::withoutGlobalScopes()
        ->where('organization_id', $org->id)
        ->where('brand_id', $brand->id)
        ->first()
        ?? \App\Models\ChatWidgetConfig::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->first();
    if (!$cfg || !$cfg->widget_key) {
        abort(404, 'Chat widget not configured for this organization');
    }
    $apiBase = rtrim(url('/'), '/') . '/api/v1/widget/' . $cfg->widget_key;
    // Route through /w/chat.js (Laravel-served, minified, long-cached)
    // instead of the static /widget/hotel-chat.js path.
    $scriptSrc = rtrim(url('/'), '/') . '/w/chat.js?v=' . (@filemtime(public_path('widget/hotel-chat.js')) ?: time());
    return response()
        ->view('chat-widget-host', [
            'widgetKey'    => $cfg->widget_key,
            'apiBase'      => $apiBase,
            'scriptSrc'    => $scriptSrc,
            'lang'         => request('lang', 'en'),
            'color'        => $cfg->primary_color ?: '#c9a84c',
            'prefillName'  => request('prefill_name', ''),
            'prefillEmail' => request('prefill_email', ''),
            'prefillPhone' => request('prefill_phone', ''),
        ])
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
});

// ─── Standalone Booking Page ────────────────────────────────────────────────
Route::get('/book/{token}', function (string $token) {
    $brand = \App\Models\Brand::resolveByToken($token);
    if (!$brand) {
        abort(404, 'Booking page not found');
    }
    $org = $brand->organization;
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

// ─── Public Lead-Capture Form (CRM Phase 10) ───────────────────────────────
// Embeddable form rendered as a standalone HTML page. The customer's
// website embeds it via <iframe src="/form/{embed_key}">. The form
// posts to /api/v1/public/lead-forms/{key}/submit which creates a
// Guest + Inquiry in the CRM.
Route::get('/form/{embedKey}', function (string $embedKey) {
    $form = \App\Models\LeadForm::withoutGlobalScopes()
        ->where('embed_key', $embedKey)
        ->where('is_active', true)
        ->first();
    if (!$form) abort(404, 'Form not found.');

    $design = $form->design ?: \App\Models\LeadForm::defaultDesign();
    $isDark = ($design['theme'] ?? 'light') === 'dark';
    $fields = $form->fields ?: \App\Models\LeadForm::defaultFields();

    // Resolve dropdown options from the org's CRM settings (e.g.
    // inquiry_types) for any field that has options_source set. This
    // keeps the public form in sync with the admin's lists.
    $visibleFields = collect($fields)
        ->filter(fn ($f) => !empty($f['enabled']))
        ->map(function ($f) use ($form) {
            if (($f['options_source'] ?? null) === 'inquiry_types') {
                $val = \App\Models\CrmSetting::withoutGlobalScopes()
                    ->where('organization_id', $form->organization_id)
                    ->where('key', 'inquiry_types')
                    ->value('value');
                $f['options'] = is_array($val) ? array_values($val)
                    : (is_string($val) ? (json_decode($val, true) ?: []) : []);
            }
            return $f;
        })
        ->values()
        ->all();

    $submitUrl = rtrim(url('/'), '/') . "/api/v1/public/lead-forms/{$form->embed_key}/submit";

    return response()
        ->view('lead-form', compact('form', 'design', 'fields', 'visibleFields', 'submitUrl', 'isDark'))
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
});

// ─── Public Privacy Policy ──────────────────────────────────────────────────
// Linked from the App Store + Google Play store listings and from the
// in-app footers. Must stay reachable without auth and with a stable URL —
// Apple's reviewers fetch it during App Review, and changing the URL would
// break the link in the App Store entry.
Route::get('/privacy', fn () => view('privacy'));

// SPA fallback — serve the React admin panel for any non-API route
Route::get('/{any}', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
})->where('any', '^(?!api/|storage/|spa/|widget/|booking-widget|book/|services-widget|services/|chat-widget/|review/|form/|privacy).*$');

Route::get('/', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
});
