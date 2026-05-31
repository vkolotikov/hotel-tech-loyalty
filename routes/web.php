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
    // Bump version when the minifier logic changes so we don't keep
    // serving a previously-broken cached payload.
    $cacheKey .= ':v6';
    $body = \Illuminate\Support\Facades\Cache::remember($cacheKey, 60 * 60 * 24 * 30, function () use ($src) {
        $code = file_get_contents($src);

        // Single-pass character scanner that handles STRINGS, LINE
        // COMMENTS, and BLOCK COMMENTS together. Earlier versions
        // stripped comments BEFORE protecting strings, which failed
        // because line comments often contain apostrophes ("don't",
        // "we're", etc.) that the string-protector then mistook for
        // real string openings — phase-shifting every subsequent
        // quote and corrupting kilobytes of code. Doing all three
        // in one stateful pass is the only robust approach without
        // a full JS parser.
        //
        // Backticks (`) are NOT treated as string openings: the
        // source uses no template literals and the only backticks
        // present are inside regex literals (e.g. /`(.+?)`/g).
        $strings = [];
        $out = '';
        $i = 0;
        $len = strlen($code);

        // Helper: walk back from end of $out to find the last
        // non-whitespace character. Used to disambiguate `/` between
        // regex-literal start vs division operator.
        $lastSignificant = function () use (&$out): string {
            $j = strlen($out) - 1;
            while ($j >= 0 && ctype_space($out[$j])) $j--;
            return $j >= 0 ? $out[$j] : '';
        };

        // Chars that can immediately precede a regex literal in JS
        // (i.e. "expression position"). Anything else means `/` is
        // either a comment marker (handled separately) or division.
        $regexPrev = ['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '~', '^', '<', '>', '%'];

        while ($i < $len) {
            $c = $code[$i];

            // ── Block comment /* ... */ — drop unless /*! banner.
            if ($c === '/' && $i + 1 < $len && $code[$i + 1] === '*') {
                $preserve = ($i + 2 < $len && $code[$i + 2] === '!');
                $start = $i;
                $i += 2;
                while ($i + 1 < $len && !($code[$i] === '*' && $code[$i + 1] === '/')) {
                    $i++;
                }
                $i += 2; // skip the */
                if ($preserve) $out .= substr($code, $start, $i - $start);
                continue;
            }

            // ── Line comment // ... \n — drop, keep the \n.
            // BUT only when the `/` is NOT the closing slash of a
            // regex literal whose previous char was `\`. Without this
            // guard, /^https?:\/\//i would have its trailing `\//i`
            // mistakenly treated as a line comment (because the
            // scanner sees `\` + `/` + `/` and the last two look
            // like `//`).
            if ($c === '/' && $i + 1 < $len && $code[$i + 1] === '/' && ($i === 0 || $code[$i - 1] !== '\\')) {
                while ($i < $len && $code[$i] !== "\n") $i++;
                continue;
            }

            // ── Regex literal /.../flags — pass through verbatim.
            // A `/` starts a regex when the preceding significant
            // char is something that can be followed by an expression
            // (operators, opening punctuators, etc.). Otherwise `/` is
            // a division operator and we just append it.
            if ($c === '/' && in_array($lastSignificant(), $regexPrev, true)) {
                $start = $i;
                $i++;
                $inClass = false; // inside [...] char class
                while ($i < $len) {
                    $cc = $code[$i];
                    if ($cc === '\\') { $i += 2; continue; }
                    if ($cc === '[') { $inClass = true; $i++; continue; }
                    if ($cc === ']') { $inClass = false; $i++; continue; }
                    if ($cc === '/' && !$inClass) { $i++; break; }
                    if ($cc === "\n") { break; } // malformed — bail
                    $i++;
                }
                // Consume flags (a-z).
                while ($i < $len && ctype_alpha($code[$i])) $i++;
                $out .= substr($code, $start, $i - $start);
                continue;
            }

            // ── String literal " ... " or ' ... ' — stash.
            if ($c === '"' || $c === "'") {
                $quote = $c;
                $start = $i;
                $i++;
                while ($i < $len) {
                    if ($code[$i] === '\\') { $i += 2; continue; }
                    if ($code[$i] === $quote) { $i++; break; }
                    $i++;
                }
                $strings[] = substr($code, $start, $i - $start);
                $out .= '__STR_' . (count($strings) - 1) . '__';
                continue;
            }

            $out .= $c;
            $i++;
        }
        $code = $out;
        // Collapse runs of whitespace.
        $code = preg_replace("/[ \t]+/", ' ', $code);
        $code = preg_replace('/\n{2,}/', "\n", $code);
        // Squeeze spaces around safe punctuators. SAFE here because
        // every string literal is already a single __STR_n__ token,
        // so the brackets/braces/commas in CSS selectors and regexes
        // can't be reached.
        $code = preg_replace('/\s*([{};,()\[\]])\s*/', '$1', $code);
        $code = ltrim($code);

        // Step 4 — restore the protected strings. Iterate because a
        // single-quoted HTML string can contain double-quoted attribute
        // values whose tokens were stashed first; restoring the outer
        // string reveals the inner tokens, which need another pass.
        // Capped iteration count prevents infinite loops.
        $iter = 8;
        while ($iter-- > 0 && str_contains($code, '__STR_')) {
            $code = preg_replace_callback(
                '/__STR_(\d+)__/',
                fn ($m) => $strings[(int) $m[1]] ?? $m[0],
                $code,
            );
        }

        return $code;
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
// Terms of Service + Data Deletion instructions — required for Meta App
// Review (alongside privacy) and for various platform-store listings.
// Same auth-less, stable-URL guarantees as /privacy.
Route::get('/terms', fn () => view('terms'));
Route::get('/data-deletion', fn () => view('data-deletion'));

// SPA fallback — serve the React admin panel for any non-API route
Route::get('/{any}', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
})->where('any', '^(?!api/|storage/|spa/|widget/|booking-widget|book/|services-widget|services/|chat-widget/|review/|form/|privacy|terms|data-deletion).*$');

Route::get('/', function () {
    $spaPath = public_path('spa/index.html');
    if (file_exists($spaPath)) {
        return response()->file($spaPath, ['Content-Type' => 'text/html']);
    }
    return view('welcome');
});
