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
        // One hour, then revalidate — NOT a year, and never `immutable`.
        //
        // This URL is stable and its contents change: the embed snippet on
        // every customer site points at a bare /w/chat.js with no version or
        // hash. `max-age=31536000, immutable` is the contract for a
        // content-addressed asset, and promising it here meant a browser that
        // had loaded the widget once would not re-fetch for a year and would
        // not even revalidate — `immutable` exists precisely to suppress the
        // conditional request. The ETag computed above was therefore dead
        // code for any returning visitor.
        //
        // The practical effect was that the widget could not be fixed in the
        // field. Any change — a bug fix, or the XSS fix in the card renderer —
        // would reach only first-time visitors until their cache expired.
        //
        // An hour of caching keeps the origin load trivial, and once stale the
        // browser sends If-None-Match and gets a 304 with no body unless the
        // file actually changed.
        'Cache-Control' => 'public, max-age=3600, must-revalidate',
        'ETag'          => $etag,
        // Allow embedding from any origin (the widget runs on the
        // customer's website, not on ours).
        'Access-Control-Allow-Origin' => '*',
    ]);
    // Out of the `web` group. It is a static script with no user in it, and
    // it is the one `web` route reachable from the landing host (see
    // LandingHostGuard) -- a public, unauthenticated marketing origin.
    // StartSession allocated a fresh session per request there, and because
    // the landing origin sets no cookies the id never came back, so nothing
    // was ever reused: with SESSION_DRIVER=database, one INSERT per request
    // that anyone can hammer.
    //
    // The whole group, not StartSession alone: ShareErrorsFromSession and
    // VerifyCsrfToken both call $request->session() unconditionally, so
    // dropping only StartSession leaves them throwing "Session store not set
    // on request". Nothing here reads a session, a cookie or a route binding
    // on any host, so it comes off everywhere rather than only on that one.
})->withoutMiddleware('web');

// ─── Public Booking Widget (embeddable) ─────────────────────────────────────
Route::get('/booking-widget', function (\Illuminate\Http\Request $request) {
    $orgId = $request->query('org', '');
    $lang  = $request->query('lang', 'en');
    $color = $request->query('color', '');

    // Build the API base URL relative to this server
    $apiBase = rtrim(url('/'), '/') . '/api';

    // Resolve the org's industry so the EMBEDDED widget speaks the same
    // language as the standalone /book/{token} page. Without this the Blade
    // falls back to hotel defaults, so a salon embedding the widget on their
    // own site invited customers to "Book your stay" and pick a "room".
    //
    // `org` may be a numeric organisation id or a brand widget token — the
    // loader documents the id, older embeds use the token. Try both, and fall
    // through to the hotel defaults if neither resolves, which is exactly
    // today's behaviour.
    $org = ctype_digit((string) $orgId)
        ? \App\Models\Organization::withoutGlobalScopes()->find((int) $orgId)
        : (\App\Models\Brand::resolveByToken((string) $orgId)?->organization);

    $industry = $org?->resolved_industry ?: \App\Models\Organization::DEFAULT_INDUSTRY;
    $vocab    = \App\Services\IndustryPrompts\BookingWidgetVocab::for($industry);

    // MUST allow framing. This page exists only to be embedded in a customer's
    // own website via widget/booking-loader.js, and the platform serves
    // `X-Frame-Options: deny` by default at the edge — so without an explicit
    // override the browser refused to render the iframe and the customer saw
    // blank space with no error on the page.
    //
    // Every other embeddable route (services-widget, review, kiosk) already did
    // this; the booking widget was simply missed. `frame-ancestors *` is the
    // part modern browsers act on; the X-Frame-Options line matches the idiom
    // used by its siblings and neutralises the inherited `deny` for older ones.
    return response()
        ->view('booking-widget', compact('orgId', 'lang', 'color', 'apiBase', 'industry', 'vocab'))
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
});

// ─── Public Services Reservation Widget (embeddable) ───────────────────────
Route::get('/services-widget', function (\Illuminate\Http\Request $request) {
    $orgId = $request->query('org', '');
    $lang  = $request->query('lang', 'en');
    $color = $request->query('color', '');

    $apiBase = rtrim(url('/'), '/') . '/api';

    // Resolve the org's industry so this EMBEDDED widget speaks the same
    // vocabulary as the standalone /services/{token} page below (template
    // fidelity phase 6.3). This was the one widget route that forwarded no
    // industry at all, so the Blade fell through to its own generic default
    // and a beauty guest arriving from a landing page that said "Therapists"
    // was asked to choose a "Master". Same resolution as /booking-widget:
    // `org` may be a numeric organisation id or a widget token; try both and
    // fall through to the platform default when neither resolves.
    $org = ctype_digit((string) $orgId)
        ? \App\Models\Organization::withoutGlobalScopes()->find((int) $orgId)
        : (\App\Models\Brand::resolveByToken((string) $orgId)?->organization);

    $industry = $org?->resolved_industry ?: \App\Models\Organization::DEFAULT_INDUSTRY;
    $vocab    = \App\Services\IndustryPrompts\BookingWidgetVocab::for($industry);

    return response()
        ->view('services-widget', compact('orgId', 'lang', 'color', 'apiBase', 'industry', 'vocab'))
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

    // Industry Platform Plan Phase 9.x — same per-industry vocabulary
    // pattern as the booking widget. The services widget shows
    // appointments / treatments / consultations / table bookings
    // depending on the org's industry. Hotel verbatim back-compat.
    $industry = $org->resolved_industry ?: \App\Models\Organization::DEFAULT_INDUSTRY;
    $vocab = \App\Services\IndustryPrompts\BookingWidgetVocab::for($industry);

    // Allow framing, for the same reason /book/{token} does: Settings hands
    // this URL to venues as the services "direct link", and they paste it into
    // their own site. The platform serves X-Frame-Options: deny by default, so
    // without an explicit override the browser silently drops the iframe and
    // the venue sees blank space with nothing in their page console.
    return response()
        ->view('services-widget', [
            'orgId'  => $token,
            'lang'   => request('lang', 'en'),
            'color'  => $color,
            'apiBase' => $apiBase,
            'standalone' => true,
            'industry' => $industry,
            'vocab'    => $vocab,
        ])
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
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

// ─── Landing-page Chat Frame (origin-isolated widget host) ────────────────
// The chat panel a landing page shows is THIS page, in an iframe, and that is
// a CSP ruling rather than a layout preference.
//
// A landing page answers with script-src 'self' and style-src 'self' plus a
// per-request nonce. The widget injects an inline <script> and writes every
// position it needs as an inline style ATTRIBUTE, and a nonce reaches neither
// of those. Loaded same-origin under that policy the widget therefore paints
// its raw DOM into the document: a full-width avatar, an unstyled SVG and
// loose text, position:static, below the footer -- which is what a real
// tenant page showed. Framed here it runs on the admin origin, whose only
// header is the frame-ancestors opt-out below, so its inline script and
// inline styles are simply allowed and nothing about the widget has to change.
//
// The KEY is the credential, exactly as it is on /api/v1/widget/*: this page
// carries no session and reads no user. Resolution mirrors
// WidgetChatController::resolveWidget() -- the same column, the same
// is_active gate, and the same Str::isUuid() guard, which is not cosmetic:
// widget_key is a Postgres `uuid` column, so a non-uuid comparison is a type
// error and a 500 rather than a miss. Anything the API would refuse to talk
// to, this page refuses to host, and there is no further gate to mirror
// because the widget API itself has none (routes/api.php, prefix widget/) --
// entitlement is enforced where the AI actually costs money, per request,
// inside the controller.
Route::get('/chat-frame/{widgetKey}', function (string $widgetKey) {
    if (!\Illuminate\Support\Str::isUuid($widgetKey)) {
        abort(404, 'Chat widget not found');
    }

    $config = \App\Models\ChatWidgetConfig::withoutGlobalScopes()
        ->where('widget_key', $widgetKey)
        ->where('is_active', true)
        ->first();

    if (!$config) {
        abort(404, 'Chat widget not found');
    }

    // Two letters or nothing. The value reaches the widget's own language
    // selection, and a landing page is the one caller -- there is no reason
    // for anything longer to arrive and no reason to carry it if it does.
    $lang = (string) request('lang', 'en');
    $lang = preg_match('/^[a-z]{2}$/', $lang) ? $lang : 'en';

    return response()
        ->view('chat-frame', [
            'widgetKey' => $config->widget_key,
            // /w/chat.js, not the static public/widget/hotel-chat.js: the
            // Laravel route minifies, sets an ETag and revalidates hourly,
            // and the edge blocks the static path outright.
            'scriptSrc' => '/w/chat.js?v=' . (@filemtime(public_path('widget/hotel-chat.js')) ?: time()),
            'lang'      => $lang,
        ])
        // MUST allow framing, for the same reason every widget host page
        // above does: the platform serves X-Frame-Options: deny at the edge,
        // and without the override the landing page renders a blank box with
        // nothing in its console. The landing side of the same boundary is
        // narrow rather than open -- its frame-src names this path and five
        // others, never the bare admin origin.
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
    // Out of the `web` group, following /w/chat.js above. This page is loaded
    // once per visitor per landing page that has chat switched on, it reads no
    // session, no cookie and no route binding, and it is framed CROSS-SITE --
    // so the SameSite=lax session cookie StartSession queues could never be
    // set by the browser anyway, while the session row PHP allocated to name
    // it would still be written. With SESSION_DRIVER=database that is one
    // INSERT per chat open that nothing can ever read back. The whole group
    // rather than StartSession alone, because ShareErrorsFromSession and
    // VerifyCsrfToken both call $request->session() unconditionally.
})->withoutMiddleware('web');

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

    // Industry Platform Plan Phase 9 — pass industry-aware vocabulary
    // into the booking widget Blade. The Blade renders the widget
    // entirely in JS at runtime, so vocab is exposed as a JSON object
    // (`window.WIDGET_VOCAB`) read by the renderer. Hotel orgs receive
    // the legacy English strings verbatim — zero behaviour change.
    $industry = $org->resolved_industry ?: \App\Models\Organization::DEFAULT_INDUSTRY;
    $vocab = \App\Services\IndustryPrompts\BookingWidgetVocab::for($industry);

    // Allow framing for parity with /booking-widget: this is the same public
    // page, and customers do embed the standalone URL directly.
    return response()
        ->view('booking-widget', [
            'orgId'  => $token,
            'lang'   => request('lang', 'en'),
            'color'  => $color,
            'apiBase' => $apiBase,
            'standalone' => true,
            'industry' => $industry,
            'vocab'    => $vocab,
        ])
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
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

// Kiosk flow: /k/{deviceKey} — a feedback tablet opens this URL once.
// The page resolves its ASSIGNED survey via the public device endpoint,
// renders it in kiosk mode (fullscreen stepper, big touch targets,
// auto-reset between guests) and re-checks the assignment every 60s so
// admins can repoint the tablet from Settings without touching it.
Route::get('/k/{deviceKey}', function (string $deviceKey) {
    $apiBase = rtrim(url('/'), '/') . '/api';
    return response()
        ->view('review-form', [
            'mode' => 'kiosk',
            'key'  => ['device' => $deviceKey],
            'apiBase' => $apiBase,
            'color' => '',
        ])
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', "frame-ancestors *");
});

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

/*
 * Public unsubscribe. No auth, no tenant, no brand middleware — the person
 * clicking is in their mail client, not signed in, and the 48-character
 * token is the credential. Registered BEFORE the SPA fallback (and excluded
 * from its pattern) so the React shell never swallows it.
 */
Route::get ('/unsubscribe/{token}',             [\App\Http\Controllers\UnsubscribeController::class, 'show']);
Route::post('/unsubscribe/{token}',             [\App\Http\Controllers\UnsubscribeController::class, 'oneClick']);
Route::post('/unsubscribe/{token}/resubscribe', [\App\Http\Controllers\UnsubscribeController::class, 'resubscribe']);

/*
 * Web app manifest â makes the admin installable as a desktop application.
 * With this and a service worker in place, Edge and Chrome on Windows offer an
 * Install action, and the result is a real window with its own taskbar and
 * Start Menu entry rather than a browser tab.
 *
 * Generated per request rather than shipped as a build artefact because the
 * browser fetches a manifest before anyone signs in. There is no session to
 * read at that point, so the host is the only brand signal available â and it
 * is sufficient, since every GTM sub-brand has its own domain. A static file
 * would install under the same name on all of them.
 */
Route::get('/manifest.webmanifest', function (\Illuminate\Http\Request $request) {
    $brand = config('pwa.hosts')[strtolower($request->getHost())] ?? config('pwa.default');

    $icon = fn (string $file, int $size, string $purpose) => [
        'src'     => '/spa/pwa/' . $file,
        'sizes'   => $size . 'x' . $size,
        'type'    => 'image/png',
        'purpose' => $purpose,
    ];

    return response()->json([
        'id'               => '/',
        'name'             => $brand['name'],
        'short_name'       => $brand['short_name'],
        'start_url'        => '/',
        'scope'            => '/',
        'display'          => 'standalone',
        'orientation'      => 'any',
        'theme_color'      => config('pwa.theme_color'),
        'background_color' => config('pwa.background_color'),
        'categories'       => ['business', 'productivity'],

        // Clicking the taskbar icon while a window is already open should
        // raise that window, not open a second copy of the same console.
        'launch_handler'   => ['client_mode' => 'focus-existing'],

        'icons' => [
            $icon('icon-192.png', 192, 'any'),
            $icon('icon-512.png', 512, 'any'),
            // Windows and Android crop icons to their own shape; the maskable
            // variant keeps the mark inside the safe area so it survives that.
            $icon('icon-maskable-512.png', 512, 'maskable'),
        ],

        'shortcuts' => array_map(fn ($s) => [
            'name' => $s['name'],
            'url'  => $s['url'],
            'icons' => [$icon('icon-192.png', 192, 'any')],
        ], config('pwa.shortcuts')),
    ], 200, [
        'Content-Type'  => 'application/manifest+json',
        'Cache-Control' => 'public, max-age=3600',
    ], JSON_UNESCAPED_SLASHES);
});

// SPA fallback — serve the React admin panel for any non-API route
Route::get('/{any}', function (\Illuminate\Http\Request $request) {
    // The landing host serves customer content only. Serving the admin shell
    // here would put a non-expiring, all-abilities admin token on the same
    // origin as customer-supplied markup, where an XSS could read it.
    // LandingHostGuard already refuses this path globally; this is the second
    // wall, and it asks the same question the same way -- $request->getHost()
    // alone honours the client-settable X-Forwarded-Host.
    abort_if(\App\Http\Middleware\LandingHostGuard::addressesLandingHost($request), 404);

    // The shell lives OUTSIDE the docroot on purpose, and reading it from
    // here is the only way it is ever served. While it sat at
    // public/spa/index.html the web server answered
    // https://<landing-host>/spa/index.html with the admin login shell before
    // PHP booted: the abort_if above never ran, and the catch-all's own
    // pattern excludes `spa/`, so the request never reached routing either.
    // Laravel Cloud's edge has no per-path or per-domain rule that could
    // close that, so the file simply must not be inside the docroot.
    // frontend/scripts/postbuild.mjs reproduces this layout on every build
    // and fails the build if the shell is left in public/spa; see
    // tests/Feature/Landing/AdminShellIsNotStaticallyServableTest.php.
    $spaPath = resource_path('spa-shell/index.html');
    if (file_exists($spaPath)) {
        // The shell must never be served from cache without checking first.
        // It was going out as `Cache-Control: public` with no max-age, which
        // lets the browser -- and Cloudflare in front of it -- invent their own
        // expiry from Last-Modified. Two consequences: a deploy's new HTML can
        // take hours to reach someone who already had the page open, and the
        // stale HTML points at asset hashes the rebuild has already deleted,
        // so lazily-loaded routes 404. `no-cache` still allows a 304 against
        // Last-Modified, so this revalidates rather than re-downloads.
        return response()->file($spaPath, [
            'Content-Type'  => 'text/html',
            'Cache-Control' => 'no-cache, must-revalidate',
        ]);
    }
    return view('welcome');
})->where('any', '^(?!api/|storage/|spa/|sw.js|manifest.webmanifest|widget/|booking-widget|book/|services-widget|services/|chat-widget/|chat-frame/|review/|k/|form/|unsubscribe|privacy|terms|data-deletion).*$');

Route::get('/', function (\Illuminate\Http\Request $request) {
    // The landing host serves customer content only. Serving the admin shell
    // here would put a non-expiring, all-abilities admin token on the same
    // origin as customer-supplied markup, where an XSS could read it.
    // LandingHostGuard already refuses this path globally; this is the second
    // wall, and it asks the same question the same way -- $request->getHost()
    // alone honours the client-settable X-Forwarded-Host.
    abort_if(\App\Http\Middleware\LandingHostGuard::addressesLandingHost($request), 404);

    // The shell lives OUTSIDE the docroot on purpose, and reading it from
    // here is the only way it is ever served. While it sat at
    // public/spa/index.html the web server answered
    // https://<landing-host>/spa/index.html with the admin login shell before
    // PHP booted: the abort_if above never ran, and the catch-all's own
    // pattern excludes `spa/`, so the request never reached routing either.
    // Laravel Cloud's edge has no per-path or per-domain rule that could
    // close that, so the file simply must not be inside the docroot.
    // frontend/scripts/postbuild.mjs reproduces this layout on every build
    // and fails the build if the shell is left in public/spa; see
    // tests/Feature/Landing/AdminShellIsNotStaticallyServableTest.php.
    $spaPath = resource_path('spa-shell/index.html');
    if (file_exists($spaPath)) {
        // The shell must never be served from cache without checking first.
        // It was going out as `Cache-Control: public` with no max-age, which
        // lets the browser -- and Cloudflare in front of it -- invent their own
        // expiry from Last-Modified. Two consequences: a deploy's new HTML can
        // take hours to reach someone who already had the page open, and the
        // stale HTML points at asset hashes the rebuild has already deleted,
        // so lazily-loaded routes 404. `no-cache` still allows a 304 against
        // Last-Modified, so this revalidates rather than re-downloads.
        return response()->file($spaPath, [
            'Content-Type'  => 'text/html',
            'Cache-Control' => 'no-cache, must-revalidate',
        ]);
    }
    return view('welcome');
});
