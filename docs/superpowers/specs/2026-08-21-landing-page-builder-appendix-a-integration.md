# Integration Brief — Industry Landing-Page Builder (`/s/{slug}`)

**Verdict up front:** this is greenfield. No landing-page / site-builder / page-template model exists in `c:/wamp64/www/Hexa-Tech`. Grep for `landing|site_builder|page_builder` hits only `ContentPlannerCampaign.landing_page` (free-text), `LoyaltyTier.soft_landing`, and analytics `top_landing`. There is no `landing_pages` feature key. Every subsystem below already exists and must be plugged into, not invented.

---

## 1. Serving the public page

### 1.1 Route registration (two edits, both mandatory)

The SPA catch-all is `Route::get('/{any}', …)` at `routes/web.php:565` — a plain `Route::get`, **not** `Route::fallback()`. Two things protect a public path:

1. **Registration order.** Your route must be declared *above* line 565.
2. **The hand-maintained denylist** at `routes/web.php:582`:

```
^(?!api/|storage/|spa/|sw.js|manifest.webmanifest|widget/|booking-widget|book/|services-widget|services/|chat-widget/|review/|k/|form/|unsubscribe|privacy|terms|data-deletion).*$
```

Add `s/` as a new alternative. Verified safe: matching is by **prefix, not path segment**, and no SPA route begins with the literal `s/` — `/scan` (`App.tsx:274`), `/segments` (`:289`), `/services` (`:391`), `/service-masters` (`:392`), `/service-extras` (`:393`), `/service-bookings` (`:394`), `/settings` (`:398`) all have a non-`/` character after `s`. The trailing slash is why `s/` is the correct token and a bare `s` would be catastrophic.

Consequence to accept: after this edit, the SPA can never own a route at `/s/*`.

Matching runs against `rawurldecode($request->getPathInfo())` (`vendor/laravel/framework/src/Illuminate/Routing/Matching/UriValidator.php:20`), so percent-encoding cannot bypass the denylist. The regex has no `i` flag — exclusions are case-sensitive.

The catch-all is GET-only. Any POST from the landing page must be an explicitly registered route (and decide on CSRF exemption, cf. `unsubscribe/*` at `bootstrap/app.php:48`).

### 1.2 Middleware the page inherits

Public routes in `routes/web.php` carry **no route middleware**; `bootstrap/app.php` never calls `$middleware->web(...)`, so they get the stock Laravel 13 `web` group (EncryptCookies, AddQueuedCookiesToResponse, StartSession, ShareErrorsFromSession, PreventRequestForgery, SubstituteBindings) plus the globally-prepended `App\Http\Middleware\Cors` (`bootstrap/app.php:36`).

Consequence: **every anonymous landing-page visit starts a session and emits `hotelloyalty_session` + a JS-readable `XSRF-TOKEN`.** Tenant resolution is done manually inside each closure (`Brand::resolveByToken($token)`, `->withoutGlobalScopes()`), never by the `tenant`/`brand` aliases — follow that.

### 1.3 Rate limiting

`grep throttle routes/web.php` → **nothing**. Every public page is unthrottled; `bootstrap/app.php` defines no `apiLimiter` and there are no `RateLimiter::for(...)` definitions in `app/`. All 55 throttles live in `routes/api.php`. House pattern is *unthrottled GET page, named throttle on the write endpoint* (`throttle:5,1,widget-lead` at `routes/api.php:255`, `throttle:5,1,leadform-submit` at `:279`). A landing page runs several DB queries per render — deviating and adding a throttle to the GET is defensible, but it is a new pattern here.

### 1.4 Cache headers

The SPA shell serves `Cache-Control: no-cache, must-revalidate` (`routes/web.php:~578`) after a documented incident. `/w/chat.js` serves `public, max-age=3600, must-revalidate` — the long comment at `routes/web.php:170` records that `max-age=31536000, immutable` previously made the widget unfixable in the field. Do not exceed a short revalidating max-age on a customer-editable page.

---

## 2. Security controls the public page must carry

Ranked by blast radius.

**(a) Same-origin XSS ⇒ full tenant compromise. This is the decisive constraint.**
The admin SPA stores its Sanctum bearer token in `localStorage`: `localStorage.setItem('auth_token', token)` (`frontend/src/stores/authStore.ts:92`), attached as `Authorization: Bearer` (`frontend/src/lib/api.ts:30`). That token **never expires** (`config/sanctum.php:45` → `'expiration' => null`) and has **full abilities** — every `createToken()` passes no ability array so Sanctum defaults to `['*']` (`AuthController.php:208, 279, 992, 1352, 2506, 2675`). Also same-origin reachable: the `loyalty-auth` zustand blob with role + capability flags (`authStore.ts:113`), `loyalty-brand` (`brandStore.ts:87`), the readable XSRF cookie, and unrestricted `fetch('/api/v1/...')`. An attacker can mint further long-lived tokens via `ApiTokenController::store` (`:81`). The service worker is registered at scope `/` (`frontend/src/lib/pwa.ts:20`) and exposes an unauthenticated `postMessage('hexatech:unregister')` (`public/sw.js:86`).

**(b) Ship a real CSP — and know that route-level CSP replaces the edge's.**
There is no security-headers middleware anywhere: repo-wide grep for `Content-Security-Policy|X-Content-Type-Options|Strict-Transport-Security|Referrer-Policy|Permissions-Policy` across `app/ config/ routes/ bootstrap/ public/index.php` returns only doc strings in `DocumentationController` and the eight `->header('Content-Security-Policy', 'frame-ancestors *')` calls on widget routes (`routes/web.php:241` et al.). Those are **permissive** — `frame-ancestors *` with no `default-src`/`script-src` restricts nothing about script execution; it exists solely to defeat the platform's edge `X-Frame-Options: deny` (comment at `routes/web.php:230-237`).

Concretely for `/s/{slug}`:
- **Do not copy** `X-Frame-Options: ALLOWALL` + `frame-ancestors *`. A landing page is a destination, not an embed. Set `frame-ancestors 'none'` (or `'self'`) — unless it must render inside the admin preview iframe, in which case `'self'`.
- Set an actual `default-src 'self'; script-src …; style-src …; img-src 'self' https://hotel-tech-assets.lon1.cdn.digitaloceanspaces.com data:; frame-src <widget hosts>`.
- There is **no CSP nonce/hash infrastructure** to hook into, and every existing public blade is built from huge inline `<script>`/`<style>` blocks (`booking-widget.blade.php` alone is 104 KB). Write the landing template with fully external assets, or emit a per-request nonce yourself. Retrofitting the existing widgets is out of scope.
- Note the third-party widget scripts you embed (§4) require `script-src` to allow the admin origin, and the widgets themselves inject iframes.
- Add `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` (neither exists anywhere today).

**(c) Escaping — copy the discipline, fix the one known gap.**
- There is **not a single `{!! !!}` in `resources/views`**. Keep it that way. `lead-form.blade.php:218-274` renders fully admin-authored labels/placeholders/options/help-text through `{{ }}`.
- Server→JS handoff uses `@json` exclusively (`booking-widget.blade.php:391`, `chat-widget-host.blade.php:66,133`, `review-form.blade.php:130`, `services-widget.blade.php:339`, `lead-form.blade.php:297`). `@json` defaults to encode option 15 (`JSON_HEX_TAG|HEX_APOS|HEX_AMP|HEX_QUOT`) — safe in script context. `chat-widget-host.blade.php:133` even does `s.src = @json($scriptSrc)`.
- Every `innerHTML` sink goes through a local escaper: `esc()` at `review-form.blade.php:160` and `booking-widget.blade.php:1796`, `escapeHtml()` at `services-widget.blade.php:529`.
- **The gap is CSS.** `{{ }}` is HTML escaping, not CSS escaping, and customer-controlled colors are already interpolated straight into `<style>`: `border-top-color: {{ $color }}` (`chat-widget-host.blade.php:51`), `--primary: {{ $design['primary_color'] ?? '#22d3ee' }}` (`lead-form.blade.php:9`), `box-shadow: 0 0 0 3px {{ … }}33` (`lead-form.blade.php:77`). A value like `#fff} * {background:url(https://evil/x)` needs no escaped character. **Validate every colour server-side against `/^#[0-9a-fA-F]{3,8}$/` before it reaches a `<style>` block**, and prefer setting CSS custom properties from a whitelist.

**(d) Bespoke copy must be plain text.** There is **no HTML-sanitisation library in `composer.json`** and no sanitiser helper in the codebase. If the wizard ever accepts rich text, that dependency and its policy are a new decision, not a reuse.

**(e) Do not accept SVG.** `validateImage()` (`vendor/…/Concerns/ValidatesAttributes.php:1492`) whitelists only `jpg,jpeg,png,gif,bmp,webp` and adds `svg` **only** with the `image:allow_svg` parameter — verified. `BrandController.php:119` and `:261` say `image|mimes:…,svg` and therefore silently reject every SVG (the `image` rule fails before `mimes` is consulted). Leave it that way for landing-page assets. `/storage/{path}` (`routes/web.php:12`, `where('path','.*')`) streams via `Storage::disk('public')->response()`, which sets `Content-Type` from the file's own mime and `Content-Disposition: inline` — an SVG served there executes with full same-origin privilege, i.e. control (a).

**(f) Slug hygiene.** Enforce a reserved-slug denylist that includes every SPA top-level route name and every existing public prefix, plus uniqueness scoped how you decide (global vs per-org — global is safer because the URL has no tenant segment). Look up with `->withoutGlobalScopes()->where('slug',…)->where('is_published', true)` and 404 otherwise (the existing precedent: `LeadForm::withoutGlobalScopes()->where('embed_key',…)->where('is_active',true)` at `routes/web.php:447`).

**(g) Session/cookie facts to be aware of (all pre-existing, all confirmed):**
- `config/session.php:49` hardcodes `'encrypt' => false` and never reads env. Both `.env:15` and `.env.production:15` set `SESSION_ENCRYPT=true` and it is **silently ignored**.
- `SESSION_SECURE_COOKIE` is unset in `.env.production`; `config('session.secure')` → null → coerced false, so the session cookie and XSRF-TOKEN go out **without `Secure`** despite `APP_URL=https://loyalty.hotel-tech.ai` (`.env.production:5`).
- `SESSION_DOMAIN` unset → host-only cookies; sub-brand domains do not share a session today. If anyone ever sets `SESSION_DOMAIN=.hotel-tech.ai`, an XSS on any one host reaches all of them.
- XSRF-TOKEN is httpOnly-`false` by hardcoded constructor argument (`vendor/…/Http/Middleware/PreventRequestForgery.php:248`); `config/session.php:184`'s `http_only` governs only the session cookie.
- Cookie name resolves to `hotelloyalty_session` (`config/session.php:129` + `APP_NAME=HotelLoyalty` in both env files, line 2).

**(h) CORS you will inherit.** `app/Http/Middleware/Cors.php` is prepended globally so it decorates web responses too. `$isPublicRoute` matches only `api/v1/widget/*`, `api/v1/theme`, `api/v1/booking/*` (`Cors.php:41`). Everything else falls to the allowlist branch (`:45-48`): with `CORS_ALLOWED_ORIGINS` set and ≠ `'*'`, an unmatched origin gets the literal string `Access-Control-Allow-Origin: null`. Both env files set it (`.env:19` = `http://127.0.0.1:8000`; `.env.production:19` = `https://loyalty.hotel-tech.ai,https://saas.hotel-tech.ai`), and the `configured` branch is evaluated **before** the `local`/`testing` branch, so this applies in dev too. `Access-Control-Allow-Credentials` is never set. `Vary: Origin` is appended, not set (`Cors.php:29`). `config/cors.php` is dead — Laravel's `HandleCors` is not wired up.

> **Map disagreement, resolved by reading the source:** the widget-surfaces map claimed non-widget routes "fall through to the generic branch which still reflects the origin." That is only true when `CORS_ALLOWED_ORIGINS` is empty or `'*'`. In both shipped env files it is neither. The public-page map is correct.

---

## 3. Plan gating: adding the Enterprise key `landing_pages`

### 3.1 How the gate actually works

`RequireFeature::handle(Request, Closure, string $feature)`, aliased `feature` in `bootstrap/app.php:35`. No network. Order: platform-admin bypass (`RequireFeature.php:30`) → no org ⇒ 403 `{'code':'no_org'}` (`:41`) → `!hasActiveSubscription()` ⇒ 402 `{'code':'subscription_inactive'}` → `!hasFeature()` ⇒ 402 `{'code':'feature_locked','feature':…,'plan':…,'upgrade_url':'https://saas.hotel-tech.ai/admin/subscription'}` (`:49`). That 402 body is the exact contract the SPA interceptor keys on (`frontend/src/lib/api.ts:85`). For non-router paths throw `App\Exceptions\FeatureNotEntitled` (`:23`), rendered to the identical 402 by `bootstrap/app.php:78`.

Truth function: `Organization::hasFeature()` (`app/Models/Organization.php:200`) — absent key ⇒ false; bool as-is; string ⇒ true unless in `['','false','0','none','no']`; else `(bool)`. `hasActiveSubscription()` = status in `['ACTIVE','TRIALING']` (`Organization.php:137`).

There is **no local plan catalog table**. `organizations.plan_features` is a cached JSON blob written by three writers: `SaasAuthMiddleware::maybeSyncEntitlements()` (`:164`), trial provisioning `getTrialFeatures()` (`AuthController.php:1347`, `:2357`), and `syncEntitlementsFromSaas()` (`:1904` region). Staleness window is 5 minutes (`SaasAuthMiddleware.php:99`); refresh is forced by `POST /api/internal/entitlements/bust` (`routes/api.php:88`, HMAC `X-Signature` with `SAAS_JWT_SECRET`, nulls `entitlements_synced_at` via `saveQuietly()` and forgets `subscription_status:{saasId}`).

### 3.2 The checklist

**SaaS side (repo `apps/saas/backend`, not in this checkout):**
1. Migration `YYYY_MM_DD_HHMMSS_add_landing_pages_feature.php` seeding `landing_pages` with the **literal strings** `'false'` / `'false'` / `'true'` for starter/growth/enterprise, race-safe `insertOrIgnore` (pattern of `2026_06_07_120000_add_v2_pricing_features.php`, `2026_06_08_130000_add_v3_pricing_features.php`).
2. Mirror the row in `database/seeders/DatabaseSeeder.php`.
3. **Deploy this before the loyalty gate** — see gotcha in §3.3.

**Loyalty side (this repo):**
4. Wrap the *admin builder* routes: inside `Route::middleware(['saas.auth','auth:sanctum','tenant','brand','throttle:240,1'])` (`routes/api.php:298`) → `Route::prefix('admin')->middleware(['admin','check.subscription'])` (`routes/api.php:397`) → `Route::middleware('feature:landing_pages')->group(function () { … });`. Live models to copy: `feature:time_management` (`routes/api.php:1130`), `feature:admin_ai` (`:1252`), `feature:campaigns` (`:531`), `feature:reviews` (`:783`), `feature:chatbot` (`:846`, `:900`, `:921`), `feature:wallet` (`:521`), `feature:engagement` (`:431`).
5. **Leave the public render route ungated** so a downgraded org's published pages keep working — the chatbot/reviews/wallet precedent.
6. `AuthController::getTrialFeatures()` (`:1904`) — add `'landing_pages'` to **all four** match arms including `default`. Omitting `default` is silent and is what unknown/legacy plan slugs get on the SaaS-unreachable path.
7. `AuthController::subscription()` platform-admin synthetic map (`:1406-1432`) — add `'landing_pages' => 'true'`, or platform admins 402 on their own bypass routes.
8. `frontend/src/hooks/useSubscription.ts:24` LOCAL map — add `landing_pages: 'true'` for consistency (it is effectively dead; `hasFeature` short-circuits on `if (isLocal) return true` at `:101`).
9. `frontend/src/lib/planFeatures.ts` — add `{key:'landing_pages', label:'…'}` to `ALL_FEATURES` (`:81`) and a value on **all three** plans in `PLAN_FEATURES` (`:116`): `false`, `false`, `'<detail string>'`.
10. `frontend/src/lib/planFeatures.test.ts:94` — extend `enterpriseOnly = ['time_management','admin_ai','brands']` to include `'landing_pages'`.
11. i18n, **all five locales** (en/ru/de/fr/es): `auth.plans.feature.landing_pages`, plus `auth.plans.detail.<slug>.landing_pages` for every string-valued cell. `localisedCopy.test.ts:100,118` runs `it.each(['ru','de','fr','es'])` over these; all five bundles currently hold exactly 19 feature keys and must all move to 20 in the same commit.
12. `upgrade_modal.features.landing_pages.{title,blurb}` in en (others optional — i18next `defaultValue` covers gaps) + a `FRIENDLY_LABELS` entry in `frontend/src/components/UpgradeFeatureModal.tsx:27`. Also `nav_locked.*`.
13. `frontend/src/components/Layout.tsx` nav item gets `feature: 'landing_pages'`; `frontend/src/App.tsx` route(s) get `feature="landing_pages"` on `LazyRoute`.
14. `DocumentationController` article/FAQ under "Plans & Pricing" (`app/Http/Controllers/Api/V1/Admin/DocumentationController.php:70`) so the admin AI can answer "why is Landing Pages greyed out?".
15. Add a case to `tests/Feature/Middleware/RequireFeatureTest.php`.
16. `cd frontend && npm install && npm run build`, then **commit `frontend/dist` and `public/spa`** — both are git-tracked; the build is committed, not built on deploy. `npm install` first or the build fails.
17. If any org is already using the builder at launch, add a temporary SaaS-side grace migration with a documented sunset and mount a `GraceWindowBanner`-style notice (`frontend/src/components/GraceWindowBanner.tsx:33`).

### 3.3 Gating gotchas that will bite

- **Backend and frontend `hasFeature()` disagree on non-boolean strings.** `Organization::hasFeature` treats `'Pick a template, publish in minutes'` as **true**; the SPA's `hasFeature` accepts only `'true'`, `'unlimited'`, or a string that `Number()`s > 0 (`useSubscription.ts:93`). Seed the entitlement as the literal `'true'`/`'false'`, never a descriptive string, or routes pass while the UI shows a lock.
- Keep the `planFeatures.ts` marketing key **identical** to the entitlement key. Existing splits (`api`→`api_access`, `mobile`→`mobile_app`, `analytics`→`ai_insights`) are a known wart; v2/v3 keys avoided it.
- **Do not model on `content_planner`**: it is row 8 of `ALL_FEATURES`, sold on Growth+, and the `Route::prefix('content-planner')` group at `routes/api.php:552` sits *outside* the `feature:campaigns` group (which closes at :545) with no `feature:` middleware at all — zero backend enforcement.
- Deploy order matters. `maybeSyncEntitlements()` **preserves** the previous `plan_features` when SaaS returns an empty features map for an ACTIVE/TRIALING org (logs a WARNING, `SaasAuthMiddleware.php:163`). Mid-migration, a brand-new key reads as "stuck off". SaaS migration first.
- Manual DB flips wait up to 5 minutes (no Stripe webhook ⇒ nothing calls `/api/internal/entitlements/bust`); null `entitlements_synced_at` by hand to force it.
- Platform-admin bypass is inconsistent: `User::isPlatformAdmin()` lowercases both sides (`User.php:92-98`) but `AuthController::subscription` does a case-**sensitive** `in_array($user->email, $platformEmails, true)` (`:1405`). Mismatched casing ⇒ routes work, UI shows everything locked.
- `feature:` calls `Auth::user()`, so the group must be nested inside auth. A top-level `feature:` group 403s `no_org` for everyone.
- Gated sidebar items are **not filtered out** — they are marked `_locked`, greyed with a gold lock badge, and dispatch `feature:locked` (`Layout.tsx:531,688`). Hiding them killed discoverability. The one exception is the floating admin-AI FAB (`App.tsx:136`).

---

## 4. Widget embed snippets the templates will emit

Four tokens are in play and **they are not interchangeable**:

| Surface | Token | Column / type |
|---|---|---|
| Chat widget | `widget_key` | `chat_widget_configs.widget_key`, Postgres `uuid`, unique, one row per org (`migration 2026_04_02_000002:14`, `ChatWidgetConfig.php:104`) |
| Booking, services, chat-host page | `widget_token` | `organizations.widget_token` (str 64, unique, `Str::random(32)`, `migration 2026_04_01_400002:19`) mirrored to `brands.widget_token` (`migration 2026_05_10_100000:46`) |
| Review form | `id` **+** `embed_key` | `review_forms.embed_key` str 64, **`->index()` not unique** (`migration 2026_04_14_150000:22`) |
| Lead form | `embed_key` | `lead_forms.embed_key` str 40, **unique** (`migration 2026_05_10_140000:38`) |

`WidgetChatController::resolveWidget()` rejects any non-UUID string before touching the DB (`:230`); `BookingPublicController::bindOrg()` matches only `Organization::where('widget_token',…)` (`:2164`); `ServicePublicController::bindOrg()` the same (`:875`).

### 4.1 AI chat widget — script form ONLY

Generated by `ChatWidgetConfig::generateEmbedCode($baseUrl)` (`app/Models/ChatWidgetConfig.php:132`):

```html
<link rel="preconnect" href="{origin}" crossorigin>
<link rel="dns-prefetch" href="{origin}">
<script>
(function(){var w=window,d=document;w.HotelChat={key:"{widget_key}",api:"{origin}/api/v1/widget/{widget_key}"};var s=d.createElement("script");s.src="{origin}/w/chat.js?v={mtime}";s.async=true;d.head.appendChild(s)})();
</script>
```

`{mtime}` = `@filemtime(public_path('widget/hotel-chat.js'))`. `hotel-chat.js:12` bails if `!cfg.key || !cfg.api`. Placement: before `</body>`. `/w/chat.js` (`routes/web.php:26`) minifies on the fly and serves `Cache-Control: public, max-age=3600, must-revalidate` + ETag + `Access-Control-Allow-Origin: *` (`routes/web.php:186,193`). **Do not strip `?v=` and do not lengthen that max-age** (`routes/web.php:170` comment).

**Do not use the iframe variant.** `ChatWidgetConfig::generateIframeCode()` (`:163,172`) emits `<iframe src="{base}/widget/chat/{widget_key}">` and **no such route exists** — grep across `routes/`, `public/`, `app/` returns only that model line, and `widget/` is in the SPA denylist so it 404s at the webserver. The admin's Chat Widget → Iframe tab hands customers a dead URL today.

If a template wants a full-page/embedded chat instead, use `GET /chat-widget/{brand-or-org widget_token}` (`routes/web.php:315`, renders `resources/views/chat-widget-host.blade.php`), which accepts `?prefill_name=&prefill_email=&prefill_phone=` that auto-POST to `{api}/lead`.

Endpoints the embed calls (all under `Route::prefix('widget')->middleware('throttle:200,1')` inside `v1`, i.e. `/api/v1/widget/{widgetKey}/…`, `routes/api.php:251`): `/config`, `/init`, `/message`, `/lead`, `/heartbeat`, `/poll`, `/typing`, `/rate`, `/transcribe`, `/page-view`, `/popup-rules`, `/popup-impression`, `/realtime-session`, `/rooms`, `/availability`, `/calendar-prices`, `/book-service`.

### 4.2 Booking engine

Loader (`frontend/src/components/settings/BookingTab.tsx:50`):

```html
<!-- Hotel Tech Booking Widget -->
<div id="hoteltech-booking"></div>
<script src="{base}/widget/booking-loader.js"
        data-org="{widget_token}"></script>
```

Iframe fallback (`BookingTab.tsx:53`):

```html
<iframe src="{base}/booking-widget?org={widget_token}"
        width="100%" height="700" frameborder="0"
        style="border:0;border-radius:12px;" title="Book now"></iframe>
```

Direct link: `{base}/book/{widget_token}`. Preview: `{base}/booking-widget?org={widget_token}`.
`booking-loader.js` reads `data-org|data-lang|data-primary-color|data-theme|data-container` off the script tag **or the container div**, uses `document.currentScript` with a `script[src*="booking-loader.js"]` fallback (`:104`), injects `width:100%;min-height:620px;border:none;border-radius:12px;` `loading=lazy`, and auto-resizes on `{type:'hoteltech-widget-height', height}` (`:36,76`). Backend: `/api/v1/booking/{config,availability,quote,payment-intent,confirm,calendar-prices}` with `org` param + `X-Org-Token` header (`booking-widget.blade.php:391,605`).

### 4.3 Services catalogue

Loader (`BookingTab.tsx:56`):

```html
<!-- Hotel Tech Services Widget -->
<div id="hoteltech-services"></div>
<script src="{base}/widget/services-loader.js"
        data-org="{widget_token}"></script>
```

Iframe fallback (`BookingTab.tsx:59`):

```html
<iframe src="{base}/services-widget?org={widget_token}"
        width="100%" height="700" frameborder="0"
        style="border:0;border-radius:12px;" title="Book a service"></iframe>
```

Direct link: `{base}/services/{widget_token}`. Extra loader attrs `data-category`, `data-service` → `&category=`/`&service=`. Resize message is `{type:'hoteltech-services-height', height}` (`services-loader.js:31,47`).

**`services-loader.js` is fragile.** It still uses `scripts[scripts.length - 1]` self-detection (`public/widget/services-loader.js:19`) — `booking-loader.js` was fixed to `document.currentScript`, this one was not. Adding `async`/`defer`, or letting a page builder relocate the tag, makes it read the wrong `<script>` and bail with `[HotelTech] Missing data-org attribute`. It also will **not** read `data-org` off the container div and has no document-ready guard (throws in `<head>`). **The generated page must emit this tag synchronously, in body, immediately after its container div, with no async/defer** — or fix the loader as part of this work.

### 4.4 Review collection

Floating/popup/slide-up (`frontend/src/components/SurveyDesignPanel.tsx:424`):

```html
<script src="{origin}/widget/hotel-survey.js"
        data-survey="{form.id}" data-key="{form.embed_key}"
        data-mode="button|popup|slideup"
        data-position="right|left" data-label="Feedback" data-color="#2563eb"
        async></script>
```

For `popup`/`slideup`, `data-position|label|color` are replaced by `data-delay="{seconds}"`. `data-frequency` defaults to 90 days. `hotel-survey.js` requires **both** `data-survey` and `data-key` (`:24`), derives ORIGIN from `new URL(script.src).origin`, opens `ORIGIN + '/review/' + FORM + '?key=' + KEY` (`:39`), single-instance guard `window.__htSurveyWidget`.

Inline iframe (`SurveyDesignPanel.tsx:435`):

```html
<iframe src="{origin}/review/{formId}?key={embedKey}"
        style="width:100%;min-height:640px;border:0;border-radius:16px"
        title="Feedback survey"></iframe>
```

Other entry shapes: `/review/t/{token}` (invitation, `review_invitations.token`, `routes/web.php:398`), `/k/{deviceKey}` (kiosk, `routes/web.php:429`). `/review/{id}` is constrained `->where('id','[0-9]+')` (`routes/web.php:411`) — a token pasted there 404s at the router.

postMessage contract (`review-form.blade.php:153`): `Object.assign({source:'hotel-tech-review'}, payload)` to `'*'`; events `review-loaded`, `review-submitted` (`submission_id`, `rating`), `review-redirected`.

### 4.5 Lead forms

Iframe only, no loader (`frontend/src/pages/LeadForms.tsx:753-754`):

```html
<iframe src="{origin}/form/{embed_key}" width="100%" height="700"
        frameborder="0" style="border: 0; max-width: 600px;"></iframe>
```

Same URL is the shareable standalone page. Submits to `{origin}/api/v1/public/lead-forms/{embed_key}/submit` (built server-side as `$submitUrl`, `lead-form.blade.php:297`), then `window.parent.postMessage({type:'lead-form:submitted', formKey:'{embed_key}'}, '*')` (`:360`). Throttles: `GET` 200/min, `POST` `throttle:5,1,leadform-submit` (`routes/api.php:279`).

### 4.6 Cross-cutting embed rules

- **Framing headers.** Every embeddable route sets **both** `X-Frame-Options: ALLOWALL` and `Content-Security-Policy: frame-ancestors *` (`routes/web.php:196,240,255,349`). `tests/Feature/Widget/EmbeddableRouteFramingTest.php:96` asserts this on four routes and asserts the SPA root never gets it. The failure mode is invisible: 200 OK, correct HTML, blank space on the customer site, nothing in the console. **This applies to the widget routes your landing page iframes, not to the landing page itself** (§2b).
- Resize/event message types are **not interchangeable**: `hoteltech-widget-height` (booking), `hoteltech-services-height` (services), `{source:'hotel-tech-review', event:…}`, `{type:'lead-form:submitted'}`. All posted with targetOrigin `'*'`.
- **Base URL.** The booking/services snippets compute `widgetBaseUrl` **client-side** as `window.location.origin` unless hostname is `localhost`, where it hardcodes `http://localhost/hotel-tech/apps/loyalty/backend/public` (`BookingTab.tsx:35`). The chat snippet's base comes from the server: `config('app.url')` (`.env.production:5` = `https://loyalty.hotel-tech.ai`; `.env:5` = `http://127.0.0.1:8000`). **A server-rendered landing page must emit `config('app.url')` consistently for all four widgets** — do not port the client-side heuristic.
- **Non-default brands are broken for booking/services.** `brands.widget_token` for a non-default brand is a fresh random value never mirrored into `organizations.widget_token` (`Brand::booted` syncs only when `is_default`). `/book/{brand2token}` and `/services/{brand2token}` render (Brand::resolveByToken checks brands first) but the API binds nothing. **Emit the organisation's `widget_token`** unless you first fix `bindOrg`.
- `/booking-widget?org=` accepts a numeric org id *for vocabulary resolution* (`routes/web.php:216`) but the API it calls binds only by token — a numeric id renders correct wording with empty data. Always emit the token.
- **No domain allowlist exists anywhere.** The key in the snippet is the only credential; any origin can load any widget. Rate limiting is the sole abuse control (`throttle:200,1` on the widget prefix; named buckets `widget-message 60/min`, `widget-lead 5/min`, `widget-rate 5/min`, `widget-book 10/min`, `leadform-submit 5/min`). The third throttle argument is load-bearing — unnamed nested throttles share one `sha1(domain|ip)` bucket (`routes/api.php:239`).
- `trustProxies(at: '*')` (`bootstrap/app.php:34`) is what makes per-IP buckets real behind the LB.

---

## 5. Images: uploads, storage, and rendering off-SPA

### 5.1 The pipeline

`app/Services/MediaService.php` — all static, no DI, no interface. Entire API: `disk()` (`:20`), `upload(UploadedFile, string $folder): string` (`:43`), `putRaw(string $contents, string $folder, string $ext='png', string $visibility='public'): string` (`:80`), `delete(?string $url): void` (`:109`), `url(?string $path): ?string` (`:130`). No `uploadMany`, no variants, no metadata return — you get one string, never width/height/size/mime.

`disk()` reads `config('filesystems.media_disk')` (env `MEDIA_DISK`, default `'public'`, `config/filesystems.php:26`); if set and ≠ `'public'` it wins, else auto-detects DO Spaces from key/secret/bucket. **Both `.env:42` and `.env.production:42` set `MEDIA_DISK=do`** — verified — so local dev uploads land in the *production* `hotel-tech-assets` bucket, and `.env.example` ships neither key so a fresh clone silently falls back to the local `public` disk.

Path: `$prefix = $orgId ? "org-{$orgId}/{$folder}" : $folder`, then `storePublicly()` ⇒ `Str::random(40).'.'.guessExtension()`. `putRaw` uses `bin2hex(random_bytes(16))`.

**Return shape is disk-dependent** and every consumer column holds a mix: on `public` you get a relative `'/storage/'.$path` (`MediaService.php:62`); on any cloud disk you get the full absolute CDN URL (`:96`).

`current_organization_id` is bound by `TenantMiddleware` (`:15`), possibly rebound by `BrandMiddleware` (`:93`). **`app()->bound('current_organization_id')` is always true** — `AppServiceProvider.php:24` binds it to `null` at boot. Never use `bound()` as a proxy for "tenant resolved". An unauthenticated upload endpoint would drop files in a non-org-prefixed folder shared across all tenants.

### 5.2 What to copy

- **Validation:** house rule is `'nullable|image|mimes:jpeg,png,jpg,webp|max:5120'` (KB) — `ServiceController.php:57`. Deviations: settings logo 4096 (`SettingsController.php:587`), chat avatar/offers/member avatar 2048. Only `InquiryAttachmentController.php:70` does a real server-side `getMimeType()` check.
- **Gallery:** copy `BookingRoomController::applyPhotos` (`:119-183`) — the only implementation supporting reorder + delete. Client sends `photos_order` = JSON array of existing URLs or `"new:N"` tokens indexing `gallery_files[N]`; server rebuilds the ordered list, dedupes, sets `image = $final[0]` (cover) and `gallery = array_slice($final,1)`, then deletes unreferenced old URLs. **Do not** copy `ServiceController.php:76` (append-only, no ordering, no cleanup).
- **Frontend gallery editor:** `frontend/src/pages/BookingRooms.tsx:291,333,349` — `PhotoItem[]` seeded from `[image, ...gallery]` via `resolveImage`, new picks as `{id, file, preview: URL.createObjectURL(file)}`, HTML5 draggable grid, `fd.append('photos_order', JSON.stringify(order))` + `gallery_files[]`.
- **Column shapes:** `gallery` = nullable `json` cast `'array'`; cover in a separate `image` `varchar(255)` (`Service.php:23`, `BookingRoom.php:21`). A DO CDN URL runs ~125 chars — fits, no headroom. `hotel_settings.value` is `text` (`migration 2026_03_18_000001:14`); `content_planner_visual_briefs.image_url` is `text`. **Prefer `text` for landing-page image columns.**
- **AI-generated hero:** `MediaService::putRaw($bytes, 'content-planner/images', 'png')` (`ImageGenerationService.php:63`) is the only non-`UploadedFile` producer.

### 5.3 Known-broken things not to rely on

- **No resizing, optimisation, thumbnails, or WebP conversion exists anywhere.** No intervention/image, no spatie/image, no imagick in `composer.json` (only `endroid/qr-code`); repo grep hits only QR GD fallbacks (`QrCodeService.php:42`). No client-side canvas compression either. Files are stored byte-for-byte. **No dimension validation of any kind** — a 6000×4000 5 MB JPEG is accepted and served full-size as a hero. Bounded hero sizes must be built from scratch, and GD/Imagick availability in prod is known-shaky (`MemberController.php:244` PNG→SVG fallback).
- **`MediaService::url()` is a no-op** — verified: both branches `return $path` unchanged (`:130-136`) despite the docblock. Nothing calls it.
- **`MediaService::delete()` resolves against the *current* disk, not the disk the file was written on** (`:109-125`). A legacy `/storage/…` value under `MEDIA_DISK=do` runs `Storage::disk('do')->delete('/storage/…')`, a silent no-op because the `do` disk has `'throw' => false`.
- `gallery_files[]` is **never validated** — no `image|mimes|max` on the array in either controller; arbitrary files up to PHP's `upload_max_filesize` get made public. Validate yours.
- `ServiceController::removeGallery` and its BookingRoom twin only filter the JSON array — every removed image is orphaned. Model deletion never deletes files.
- **Multipart + PUT does not work in PHP.** `apiResource` updates are `PUT`, so the SPA POSTs FormData with `formData.append('_method','PUT')` (`frontend/src/pages/Properties.tsx:64`). Any landing-page save carrying files must do the same.
- Do not copy `MemberController::uploadAvatar` (`:228`) — it bypasses MediaService with `storePublicly('avatars','public')` + hardcoded `'/storage/'`. `ChatWidgetConfigController` docblock (`:108-118`) records this as the root cause of the "chat avatar disappears intermittently" bug on multi-instance Laravel Cloud.
- Uploads share the generic `throttle:240,1` bucket. There is no upload-specific limit and no per-org storage quota.

### 5.4 Rendering images on the landing page

`resolveImage()` (`frontend/src/lib/api.ts:11`) is **frontend-only** and in production `API_URL === ''` (`api.ts:5`), so it returns `/storage/x.jpg` unchanged. Server-side Blade must absolutize itself. The precedent is the vanilla-JS widget: `if (url.indexOf('http')!==0 && url.indexOf('data:')!==0) url = base + (url[0]==='/' ? '' : '/') + url` (`public/widget/hotel-chat.js:2244`, again at `:1319`). `ServicePublicController` returns `image`/`gallery` raw (`:58`) — the API never absolutizes; every client does.

Add a Blade helper that normalises both shapes once, and use it for every image on the page.

---

## 6. Industry model (drives the 3 templates)

**Canonical ids (9, order is load-bearing)** — `Organization::INDUSTRIES` (`app/Models/Organization.php:29`):
`['hotel','beauty','medical','restaurant','legal','real_estate','education','fitness','other']`.
`INDUSTRY_ALIASES = ['hospitality' => 'restaurant']` (`:44`) resolves **only at write time** — `hospitality` never appears in storage. `GTM_INDUSTRIES = ['hotel','beauty','medical','restaurant']` (`:52`). `DEFAULT_INDUSTRY = 'hotel'` (`:55`). `tests/Feature/Crm/IndustryResolutionTest.php:113,130` assert both with `assertSame` — reordering breaks them by design.

**Reading:** `$org->resolved_industry` (`Organization.php:263`) → raw `organizations.industry` normalised → legacy `crm_settings.industry_preset` → `'hotel'`. Never null, never memoised. `$org->industry` stays the raw nullable `string(32)` indexed column (`migration 2026_06_04_120000:35`). `hasExplicitIndustry()` (`:313`) distinguishes a real choice from the hotel fallback — **use it before showing an industry-specific template set.**

**Existing per-industry design tokens.** `OrganizationSetupService::industryPrimaryColor()` (`:239`) is the closest thing to a per-industry palette and is what a template should key its accent on: beauty `#d96aa8`, medical `#4a9fd8`, restaurant `#d97742`, fitness `#f97316`, education `#7c6fd8`, legal `#8a99b5`, real_estate `#3fae8a`, other `#4c6ef5`, hotel `#c9a84c`. Also `reviewFormCopy()` (`:258`) and `defaultIdentityFor()` (`:273`).

**Existing per-industry copy.** `frontend/src/lib/industryCopy.ts:23` `IndustryCopy` = `{brand, hero, heroSub, heroBullets(3), tabTitle, orgLabel, orgPlaceholder, planTagline, workspaceNoun}`, with **complete entries for all 9 ids** at `:56` — *the docblock claiming legal/real_estate/education/fitness are minimal is stale; read the data.* Type is `Partial<Record<…>>` so TS will not catch a missing id; `industryCopyFor()` (`:209`) silently falls back to hotel. `localisedIndustryCopy()` (`:228`) overlays `industries.<id>.{hero,heroSub,orgLabel,planTagline,workspaceNoun,heraBullets.<i>}` from all 5 locales (`en/common.json:2937`); `brand` and `tabTitle` are deliberately untranslated. There is **no section-level or per-service landing wording** beyond hero/heroSub/heroBullets — a template catalogue must author its own.

**Catalogue pattern to copy.** `IndustryPresetService` (`app/Services/IndustryPresetService.php:604` PRESETS, `:45` `listPresets()`, `:77` `apply()`) is the cleanest: a `public const` map keyed on the 9 industry ids, a list endpoint returning card metadata (`key,label,description,icon,…,is_current`), an apply endpoint returning a summary, `InvalidArgumentException` on unknown key → 422 in the controller. `PlannerPresetService` (`:132,35,65`) is the thinner twin. `ChatbotPresetService::for()` (`:140`) is the readonly-DTO variant with a `match()` per industry and a DataProvider parity test (`tests/Unit/Chatbot/ChatbotPresetServiceTest.php:44`) — **write that parity test for the template catalogue.**

**Gotchas:**
- Preset keys are not uniformly industry ids: `LoyaltyPresetService::PRESETS` uses 10 *preset* ids bridged by a private `ALIASES` map (`:147,149`). If your template service is keyed on industry ids, say so in the docblock.
- `'medical'` is a recurring special case: `LoyaltyPresetService::NO_PROGRAMME_INDUSTRIES = ['medical']` (`:149`), `IndustryPromptProfile.hasLoyalty` false, and `industryGating.ts` hides the whole Members & Loyalty nav group. **No loyalty/rewards section in a medical template.**
- `detectIndustryFromHost()` is **lenient** — unknown/preview hosts silently return `'hotel'`. Use `detectIndustryFromHostStrict()` / `detectIndustryFromWindow(true)` (`frontend/src/lib/industryHosts.ts:167,193`), as `Login.tsx` does, or every staging domain gets hotel templates.
- `INDUSTRY_PRIMARY_DOMAIN` (`industryHosts.ts:211`) maps five ids to the umbrella `app.hexa-tech.uk` — it is **not** a per-industry landing domain map.
- **Four hand-maintained frontend industry card lists exist and disagree.** `PICKER_INDUSTRIES` (`industryCopy.ts:267`) and `Setup.tsx:40` have 9; `IndustrySwitcherPanel.tsx:52` has **8** — it omits `'other'` entirely. Do not use the switcher array as a source of truth.
- Silent-fallback vs throw is inconsistent: `industryCopyFor()`, `ChatbotPresetService::for()`, `BookingWidgetVocab::for()` all fall back to hotel; `IndustryPresetService::apply()` and `PlannerPresetService::apply()` throw. **Pick throw** — a silent hotel fallback ships hotel imagery to a clinic.
- `organizations.industry` is unrelated to `corporate_accounts.industry` and `content_planner_audiences.industry`, which are free text.
- There are **no per-industry image assets** and no naming convention (`public/assets/images` holds only `hexatech_logo.webp`).

---

## 7. Admin UI conventions the wizard + editor must follow

### 7.1 Wizard shell

No shared Wizard/Stepper primitive exists. Three precedents, one anatomy: header block → step indicator → step body card(s) → footer nav (`flex items-center justify-between mt-6`, Back/Skip left, primary right).
- `ChatbotWizard.tsx:141` — `max-w-3xl mx-auto pb-16`, numbered-node stepper (`:162`), most design rationale in its header comment, most on-token.
- `MembersOnboarding.tsx:113` — full-bleed takeover `bg-dark-bg min-h-[calc(100vh-80px)] flex flex-col items-center px-4 py-8` + inner `w-full max-w-3xl`, pill stepper (`:135`).
- `ContentPlanner/SetupWizard.tsx:1362` — `mx-auto w-full max-w-3xl p-4 sm:p-6`, scroll-capped body `max-h-[calc(100vh-330px)] min-h-[300px] overflow-y-auto` inside `rounded-lg border border-dark-border bg-dark-surface`, footer pinned in a `border-t`. Its `Stepper({current, onJump})` (`:524`) is the only jumpable one and the only extractable one.

State is plain `useState` + `{step === N && …}` + module-level `const STEPS = [...]` (`ChatbotWizard.tsx:59`, `SetupWizard.tsx:130`). No context, no router-driven steps.

**Form state:** either the loose "local ?? server ?? fallback" resolution at render (`ChatbotWizard.tsx:80,85` — `form.assistant_name ?? data?.preset.assistant_name ?? ''`), which distinguishes "untouched" from "cleared" with no hydration effect; or one typed object + `emptyForm()`/`fromProfile()` + a single patch fn `up` + `buildPayload()` at submit (`SetupWizard.tsx:1286,336`). For a wizard with server-provided templates, the first is the better fit.

### 7.2 Backend contract for the wizard

House endpoint triple: `GET /v1/admin/<thing>-onboarding` → `{completed, …presets/prefill}`, `POST /v1/admin/<thing>-onboarding` (apply), `POST …/skip` (`ChatbotWizard.tsx:77,103`; `MembersOnboarding.tsx:77`; `routes/api.php:858`). Controller model: `ChatbotOnboardingController.php:23` — thin, delegates to a service (`ChatbotOnboardingService.php:15`), `$request->validate()` **mirroring the rules of the settings screen that owns the same fields** (explicitly commented), whole apply in one `DB::transaction`, returns a summary the confirmation UI reads. **Route must sit in the same feature-gate group as the settings it writes**, or a Starter org gets a wizard that 402s halfway through.

**Completion marker:** a row in org-scoped `crm_settings`, written by **both apply and skip** so dismissal sticks (`ChatbotOnboardingService::MARKER` `:42`; `LoyaltyPresetController.php:69` also writes `members_onboarding_skipped`). `crm_settings` is unique on `(organization_id, key)` with **no brand column** (verified: `database/migrations/2026_05_11_120000_crm_settings_per_org_unique.php:36`) — marker-gated wizards run **once per organisation**, not per brand. Do not gate a per-brand editor on a crm_settings marker.

**Gate lives in the host page, not the wizard**, and every hook must run **before** the early return — `Members.tsx` carries an explicit comment about this: the gate used to sit above the queries and crashed with "Rendered more hooks than during the previous render" on every hard refresh. Pattern: `ChatbotSetup.tsx:79` `if (onHome && !onboardingLoading && onboarding && !onboarding.completed && !wizardDone) return <Wizard onDone={() => setWizardDone(true)} />`. Keep the local `wizardDone` latch — `invalidateQueries` alone leaves the wizard on screen through the refetch.

**Re-opening a finished wizard:** either clear the marker via `PUT /v1/admin/crm-settings/{key}` with `{value: 'null'}` then hard-navigate (`MenuSettings.tsx:212`, `routes/api.php:1244`), or mount the same component in edit mode from a settings tab with an `existing` prop that branches copy/behaviour (`ContentPlanner.tsx:143`, `SetupWizard.tsx:1284`).

### 7.3 Data layer

`useQuery({queryKey:['<kebab-key>'], queryFn: () => api.get(url).then(r => r.data)})` + `useMutation({mutationFn, onSuccess: () => { qc.invalidateQueries({queryKey:[…]}); toast.success(…) }, onError: e => toast.error(e.response?.data?.error ?? e.response?.data?.message ?? 'Fallback')})`. Client defaults `retry: 1, staleTime: 30_000, refetchOnWindowFocus: false` (`frontend/src/lib/queryClient.ts:1`). **No optimistic updates anywhere** — no `onMutate`, no rollback. All calls go through the shared axios `api` (`frontend/src/lib/api.ts:19`) which auto-attaches the Bearer token **and `brand_id`**, so never pass brand manually. Path prefix `/v1/admin/…` is mandatory. FormData: the request interceptor deletes `Content-Type` when `config.data instanceof FormData` (`api.ts:28-37`).

### 7.4 Styling

Module-level string consts concatenated with `+`/template literals — **not** cva/clsx/tailwind-merge (`clsx` is imported only by `Card.tsx` and `Layout.tsx`). Copy verbatim (`ChatbotWizard.tsx:66-69`, `ChatbotWidget.tsx:162-166`):

```
card      = 'bg-dark-card border border-dark-border rounded-xl p-5'
cardTitle = 'text-sm font-semibold text-white flex items-center gap-2'
label     = 'block text-xs text-t-secondary mb-1.5'
input     = 'w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:border-primary-500 outline-none'
btnSec    = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-dark-bg border border-dark-border text-t-secondary rounded-lg hover:text-white'
kicker    = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'
btnPrimary= 'px-5 py-2.5 text-sm font-medium bg-primary-500 text-black rounded-lg hover:bg-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
```

**Selectable-card (the dominant wizard input)** — `<button type="button" aria-pressed={active}>` with `'text-left rounded-xl border p-4 transition-all ' + (active ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-…/30' : 'border-dark-border bg-dark-surface hover:border-… hover:bg-…/[0.04]')`, icon tile `w-9 h-9 rounded-md bg-<accent>/15`, `text-sm font-bold text-white` title, `text-[11px] text-gray-500` blurb, `<Check size={16}/>` when active, footer metrics `text-[9px]/[10px] uppercase tracking-wide font-bold` (`MembersOnboarding.tsx:155`, `ChatbotWizard.tsx:206`, `Setup.tsx:236`). **This is exactly the shape for the 3-template picker.**

**Review step:** local presentational helpers, not generic components — `Summary({icon,text})` (`ChatbotWizard.tsx:364`), `ReviewRow({label,value})` (`MembersOnboarding.tsx:355`), `SummaryCard({title,onEdit,children})` + `Row({k,v})` with per-section Edit jumping via `onEdit(stepIndex)` (`SetupWizard.tsx:580,594`). Review steps **warn without blocking** — `text-xs text-warning/90 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2.5`.

**Tokens.** `tailwind.config.js:6` maps every colour to `rgb(var(--color-…) / <alpha-value>)`; `applyThemeToDom()` (`frontend/src/hooks/useTheme.ts:97`) rewrites `--color-primary-*`, `--color-dark-*`, `--color-text-*` per tenant, and `index.css:88,277` forks fonts/radii off a `data-mood` attribute on `<html>` (overriding `font-family` for `.text-lg` … `.text-7xl`). **Any hardcoded hex or font in admin chrome will visibly desync on a navy/serif tenant.** Inline hex is correct *only* for values that ARE customer data being previewed (template swatches, the landing page's own colours).
Geometry: `rounded-xl` cards (563 uses), `rounded-lg` inputs/buttons, `rounded-2xl` takeover panels, `p-4`/`p-5` padding, `space-y-4`/`space-y-5` rhythm, `gap-3`/`gap-4` grids. Icons lucide-react 11-16 dense, 20-26 page headers.

> **Token conflict to resolve deliberately:** `bg-dark-card` (ChatbotWizard, ChatbotWidget) and `bg-dark-surface` (everything else — 525 vs 18 occurrences) are **different shades**; `dark-card` = `dark-surface2`. Pick one for the whole feature. Also, `MembersOnboarding` is off-token (`text-gray-500`, `amber-500`, `emerald-500`, `purple-500`); `ChatbotWizard` is the on-token one — copy that.

### 7.5 Live preview panel

`ChatbotWidget.tsx:1027` is the reference: `<div className={showPreview ? 'grid grid-cols-1 xl:grid-cols-12 gap-5' : ''}>`, form in `xl:col-span-7 space-y-5 min-w-0`, preview in `xl:col-span-5` wrapping `<div className="xl:sticky xl:top-4">`, hidden on the Install tab. **The preview must be fed the same merged object the form edits** (`const f = form ?? config ?? {}` → `<WidgetPreview cfg={f}/>`, `:1059,1069`), never the query result, or it silently stops reflecting unsaved edits. It renders fake browser chrome over a checkerboard built from `rgb(var(--color-dark-bg))` at fixed `height: 520`, all customer colours as inline `style={{}}`, and carries an honesty caption: *"Reflects unsaved changes. Not a live chat — for layout only."*

For a landing page, `SurveyDesignPanel.tsx:246` is the closer precedent: a real-page `<iframe>` in a phone frame (`rounded-[28px] border-4 border-[#222]`, `aspectRatio: '9/16'`, `lg:sticky lg:top-6 self-start`), remounted on `key={previewNonce}` with live config pushed by postMessage. **If you iframe the real `/s/{slug}` preview, `frame-ancestors 'self'` must be on the landing page** (§2b) — and mini-mock `TemplatePreview` cards (`ChatbotWidget.tsx:295`) are the precedent for the template gallery tiles.

### 7.6 Editor save UX

`const [form, setForm] = useState<any>(null)`; `const f = form ?? config ?? {}`; `update(k,v) => setForm(p => ({...(p ?? config ?? {}), [k]: v}))`; `const dirty = form !== null`; `onSuccess: () => setForm(null)` snaps back to server truth (`ChatbotWidget.tsx:192`). Status bar verbatim:

```
sticky bottom-0 -mx-2 px-2 py-3 bg-dark-bg/95 backdrop-blur border-t border-dark-border flex items-center justify-between
```

containing `<span className="text-xs text-t-secondary">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>` and a disabled-until-dirty `<Save size={14}/> {isPending ? 'Saving...' : 'Save …'}`. **There is no autosave and no debounce anywhere in the admin** — introducing one is a new pattern, not a convention. (`ReviewFormBuilder.tsx:135` is the counter-example that hydrates via `useEffect` and has two independent save buttons.)

**Draft persistence** for a long wizard: `SetupWizard.tsx:118,294,1294` — `const DRAFT_KEY = 'cp-wizard-draft-v2'`, effect writes `{step, form}` (skipped when editing an existing record), `loadDraft()` **deep-merges over `emptyForm()` and clamps the step** (a raw `JSON.parse` into state breaks the wizard the first time you add a field), `removeItem` on save, plus a "Start over" button. Every localStorage access in the codebase is try/catch wrapped.

### 7.7 Page shell, routing, shared kit

`Layout` renders children inside `<main className="flex-1 overflow-y-auto mobile-safe-bottom"><div className="p-4 lg:p-6">` (`Layout.tsx:898`) — pages start with `<div className="space-y-5">` + `<h1 className="text-2xl font-bold text-white">` + `<p className="text-sm text-t-secondary mt-0.5">` and **never set their own padding or max-width** (wizards self-center as the exception).

Routes are lazy: `const X = lazy(() => import('./pages/X').then(m => ({default: m.X})))` + `<Route path="/x" element={<LazyRoute gate="admin" product="…" feature="landing_pages"><X/></LazyRoute>} />` (`App.tsx:211,309`). `LazyRoute` = ProtectedRoute + GatedRoute + ChunkErrorBoundary + Suspense. Sub-nav is either `useSearchParams` `?tab=` (ChatbotSetup) or local state + localStorage (`ChatbotWidget.tsx:169`). Brand-scoped config screens wrap in `<BrandRequired feature="…">` (`ChatbotWidget.tsx:1030`) — **a landing page is brand-scoped if you key it on `brands.widget_token`; decide this early.**

Shared kit that actually exists: `Card`/`StatCard` (`components/ui/Card.tsx:10`, `bg-dark-surface rounded-xl border border-dark-border p-6`), `TierBadge`, `DatePicker`, `QueryError({onRetry,message})` (`:12`), `BrandRequired`, `DeleteConfirmModal`, `UpgradeFeatureModal`, `LangSwitcher`, `ChunkErrorBoundary`. Everything else (Toggle, Segmented, Chips, TagInput, Stepper, Field, Section) is re-implemented per file — **at least 3 Toggle implementations exist** (`ChatbotWidget.tsx:279`, `SetupWizard.tsx:492`, `SurveyDesignPanel.tsx:50`). Toasts are always `react-hot-toast`, mounted once (`App.tsx:252`).

Loading: centered inline line, not a skeleton — `<div className="flex items-center justify-center py-24 text-t-secondary"><Loader2 size={18} className="animate-spin mr-2"/> Preparing your setup…</div>`. Module error: `max-w-md rounded-lg border border-red-500/40 bg-red-500/10 p-6` with AlertTriangle + Retry calling `refetch()` (`ContentPlanner.tsx:38,46`).

### 7.8 i18n

i18next + react-i18next + LanguageDetector, single flat `common` namespace, 5 locales, localStorage key `admin_lang`, `applyServerLanguage()` on boot (`frontend/src/i18n/index.ts:41`). Always the inline-default form `t('landing_pages.title', 'Landing Pages')`, object form for interpolation `t('…', {count, defaultValue: '…{{count}}…'})`. Toasts translated too. There is also an industry vocabulary layer consumed as `vocab(label) ?? t(key, fallback)` (`frontend/src/lib/vocabulary.ts`).

> **Convention conflict, unresolved by the code:** `ChatbotWizard.tsx`, `MembersOnboarding.tsx`, `ChatbotWidget.tsx` and `SetupWizard.tsx` contain **zero `t()` calls** — every string is hardcoded English — while their host pages (`ChatbotSetup.tsx:88`, `Members.tsx:245`) are fully translated. Building the new wizard in English matches the wizards and breaks the pages around it; translating it makes you first. **Recommend translating with the inline-default form** so nothing can render as a raw key either way.

---

## 8. Map disagreements, called out

1. **CORS on a non-widget public route.** Widget map: "falls through to the generic branch which still reflects the origin." Public-page map: "unknown origins get the literal `Access-Control-Allow-Origin: null`." **Resolved by reading `Cors.php:45-48` and both env files:** the public-page map is right whenever `CORS_ALLOWED_ORIGINS` is set and ≠ `'*'`, which is the case in `.env:19` and `.env.production:19`; the `configured` branch is evaluated *before* the `local`/`testing` branch.
2. **SVG.** Upload map: SVG is silently rejected because `validateImage()` whitelists only jpg/jpeg/png/gif/bmp/webp without `image:allow_svg`. Public-page map: SVG upload + `/storage/{path}` is a live same-origin XSS vector. **Resolved:** the validator claim is verified (`ValidatesAttributes.php:1492`); `BrandController.php:119,261` use `image|mimes:…,svg` so SVG never gets through. The vector is latent, not live — it opens the moment anyone adds `image:allow_svg` or drops `image` from a rule. Both maps are internally correct; the risk is real but currently blocked.
3. **`MEDIA_DISK=do` location.** Upload map says the local `.env`; public-page map says `.env.production`. **Both:** verified at line 42 of each.
4. **`config/cors.php`.** Widget map calls it existing-but-superseded; public-page map calls it a dead decoy. Same fact — Laravel's `HandleCors` is not registered.
5. **`useSubscription.ts` LOCAL map.** Its own docblock says missing keys make local devs see the locked state; the gating map shows `hasFeature` returns `true` on `isLocal` before ever reading it (`:101`). The docblock is stale. Add the key anyway for v2/v3 parity; do not rely on it.
6. **`INDUSTRY_COPY` completeness.** The file's docblock says legal/real_estate/education/fitness carry minimal entries; the data has complete entries for all 9. Trust the data (`industryCopy.ts:56`).

---

## 9. Unknowns — confirm before relying on any of these

**Environment / infrastructure**
1. Whether the edge (Laravel Cloud / Cloudflare) actually injects `X-Frame-Options: deny`, or any other security header or CSP. Only in-repo route comments (`routes/web.php:230-237`) and `EmbeddableRouteFramingTest.php:96` assert it; there is no nginx/Caddy/CDN config in this repo.
2. Real deployed env values. `.env.production` in this checkout is **gitignored and untracked** — it may not match what runs at loyalty.hotel-tech.ai (notably `SESSION_SECURE_COOKIE`, `SESSION_COOKIE`, whether `MEDIA_DISK` is set explicitly or relies on the DO-credential auto-detect).
3. Effective `upload_max_filesize` / `post_max_size` / `client_max_body_size` in production. No php.ini, `.user.ini`, or server config is committed; `public/.htaccess` is stock. The `max:25600` inquiry rule implies ≥25 MB somewhere.
4. DO Spaces bucket-side config: CDN TTL, CORS policy, image-transform add-on. Not in the repo.
5. Whether `deploy.sh` or any Laravel Cloud build hook runs `php artisan storage:link`. `deploy.sh` contains no `storage` reference; `/public/storage` is gitignored.
6. Whether `/widget/chat/{widget_key}` is served by something outside this repo (reverse proxy, or the monorepo at `c:/wamp64/www/hotel-tech`, which was not inspected).

**SaaS side (not checked out — `apps/saas/backend` is empty here)**
7. The exact schema of the feature catalog (table name, pivot shape, value column). The loyalty side only ever sees `$data['features']`, a flat key→string map from `GET {saas_api}/tools/bootstrap`.
8. Bodies of `2026_06_07_120000_add_v2_pricing_features.php` and `2026_06_08_130000_add_v3_pricing_features.php` — the "race-safe `insertOrIgnore` + legacy-plan warning" description comes from `hotel-tech/CLAUDE.md:920-995` and the `planFeatures.ts` docblock, not from source.
9. Whether the v3 Starter grace window was ever tightened (sunset was 2026-06-22; the tightening migration was deliberately left uncommitted).
10. Whether `LoyaltyClient::bustEntitlementCache()` fires on every plan-change shape relevant to a new Enterprise-only key.

**Content sources for the "LIVE from existing tables" half — the largest gap**
11. **No map traced where hours, contact details, or staff bios actually live.** Candidates observed but unconfirmed: `ChatbotPresetService::UNIVERSAL_FACTS` (`:77`) defines `hours, address, phone, email, booking_url, parking, cancellation` with per-industry `EXTRA_FACTS`, and the chatbot onboarding GET returns a `prefill` map for them — but the storage table/column and whether it is brand-scoped were not established. `hotel_settings` (key/value, `value` is `text`) and `crm_settings` (unique on org+key, **no brand column**) are the other candidates. **Establish this first; it determines the whole "live content" query layer.**
12. Staff: `service-masters` upload folder and a `ServiceMasters` admin page exist (`App.tsx:392`), but the model's public read path was not traced.
13. Reviews: only the *collection* side was mapped (forms, invitations, kiosk, submissions). No public "approved reviews for display" endpoint or moderation/approval flag was identified.
14. Services: `ServicePublicController` returns `image`/`gallery` raw (`:58`) via `/api/v1/services/config` bound by `widget_token`. Whether an internal (non-token) read path exists for server-side Blade was not checked.

**Repo details not verified**
15. Whether `public/spa` (the committed build) holds stale snippet strings differing from `frontend/src` — only the TS sources were read.
16. Canonical encoding of `crm_settings` values: `LoyaltyPresetController` writes `json_encode(now()->toIso8601String())` and readers `trim($marker, '"')`, while `MenuSettings` writes the literal string `'null'`. `CrmSettingsController::update` was not read.
17. Whether Flysystem actually rejects `..` traversal on `/storage/{path}` (`where('path','.*')`) — asserted from Flysystem v3 behaviour, not tested here.
18. Whether the SPA's `/portal/*` routes (`App.tsx:258-267`) are already a semi-public unauthenticated surface on this origin.
19. No test coverage exists for `MediaService` (`tests/` has no `Storage::fake()` usage), so its intended behaviour is inferred from implementation only.
20. `chat_widget_configs.api_key` (str 64, regenerable via `/v1/admin/widget-config/regenerate-key`) — no consumer was found anywhere. `widget_key` alone gates every public widget call.
21. `MemberImportWizard.tsx` and `ContentPlanner/QuickSetup.tsx` were not read in full; QuickSetup is the "short path" shown before the advanced SetupWizard (`ContentPlanner.tsx:73`) and may be the better template for a lightweight wizard.
22. Whether the team wants this work to extract shared `Wizard`/`Stepper`/`Toggle`/`Field` primitives into `components/ui` (lifting from `SetupWizard.tsx`) or keep the per-file copy convention. Nothing in the code decides it.