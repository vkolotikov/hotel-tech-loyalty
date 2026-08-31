<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Member\MemberController;
use App\Http\Controllers\Api\V1\Member\PointsController;
use App\Http\Controllers\Api\V1\Member\OfferController;
use App\Http\Controllers\Api\V1\Member\BookingController;
use App\Http\Controllers\Api\V1\Member\ReferralController;
use App\Http\Controllers\Api\V1\Chatbot\ChatbotController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\DiagController;
use App\Http\Controllers\Api\V1\Admin\MemberAdminController;
use App\Http\Controllers\Api\V1\Admin\ScanController;
use App\Http\Controllers\Api\V1\Admin\NfcController;
use App\Http\Controllers\Api\V1\Admin\OffersAdminController;
use App\Http\Controllers\Api\V1\Admin\AnalyticsController;
use App\Http\Controllers\Api\V1\Admin\NotificationController as AdminNotificationController;
use App\Http\Controllers\Api\V1\Admin\ReviewController as AdminReviewController;
use App\Http\Controllers\Api\V1\Public\ReviewPublicController;
use App\Http\Controllers\Api\V1\Public\CampaignTrackingController;
use App\Http\Controllers\Api\V1\Member\NotificationController as MemberNotificationController;
use App\Http\Controllers\Api\V1\Admin\SettingsController;
use App\Http\Controllers\Api\V1\Admin\TierController;
use App\Http\Controllers\Api\V1\Admin\BenefitAdminController;
use App\Http\Controllers\Api\V1\Admin\PropertyAdminController;
use App\Http\Controllers\Api\V1\Admin\CampaignSegmentController;
use App\Http\Controllers\Api\V1\Admin\EmailTemplateController;
use App\Http\Controllers\Api\V1\Admin\GuestController;
use App\Http\Controllers\Api\V1\Admin\InquiryController;
use App\Http\Controllers\Api\V1\Admin\ActivityController;
use App\Http\Controllers\Api\V1\Admin\TaskController;
use App\Http\Controllers\Api\V1\Admin\PipelineController;
use App\Http\Controllers\Api\V1\Admin\ReportingController;
use App\Http\Controllers\Api\V1\Admin\SavedViewController;
use App\Http\Controllers\Api\V1\Admin\CustomFieldController;
use App\Http\Controllers\Api\V1\Admin\IndustryPresetController;
use App\Http\Controllers\Api\V1\Admin\LeadFormController;
// The admin-side builder. Not to be confused with the public renderer of the
// same class name at App\Http\Controllers\Landing\LandingPageController, which
// is wired in routes/landing.php and is deliberately not gated.
use App\Http\Controllers\Api\V1\Admin\LandingOnboardingController;
use App\Http\Controllers\Api\V1\Admin\LandingPageController;
use App\Http\Controllers\Api\V1\Admin\LandingPageSectionController;
use App\Http\Controllers\Api\V1\Public\LeadFormPublicController;
use App\Http\Controllers\Api\V1\Admin\ReservationController;
use App\Http\Controllers\Api\V1\Admin\CorporateAccountController;
use App\Http\Controllers\Api\V1\Admin\PlannerController;
use App\Http\Controllers\Api\V1\Admin\PlannerPresetController;
use App\Http\Controllers\Api\V1\Admin\LoyaltyPresetController;
use App\Http\Controllers\Api\V1\Admin\TeamController;
use App\Http\Controllers\Api\V1\Admin\VenueController;
use App\Http\Controllers\Api\V1\Admin\AuditLogController;
use App\Http\Controllers\Api\V1\Admin\CrmSettingsController;
use App\Http\Controllers\Api\V1\Admin\CrmAiController;
use App\Http\Controllers\Api\V1\Admin\ChatbotConfigController;
use App\Http\Controllers\Api\V1\Admin\KnowledgeBaseController;
use App\Http\Controllers\Api\V1\Admin\RealtimeController;
use App\Http\Controllers\Api\V1\Admin\SetupController;
use App\Http\Controllers\Api\V1\Admin\BookingAdminController;
use App\Http\Controllers\Api\V1\Admin\BookingRoomController;
use App\Http\Controllers\Api\V1\Admin\BookingExtraController;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Http\Controllers\Api\V1\Admin\EngagementController;
use App\Http\Controllers\Api\V1\Admin\MeController;
use App\Http\Controllers\Api\V1\Admin\ServiceCategoryController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\Admin\ServiceMasterController;
use App\Http\Controllers\Api\V1\Admin\ServiceExtraController;
use App\Http\Controllers\Api\V1\Admin\ServiceBookingController;
use App\Http\Controllers\Api\V1\BookingPublicController;
use App\Http\Controllers\Api\V1\ServicePublicController;
use App\Http\Controllers\Api\V1\Admin\ChatWidgetConfigController;
use App\Http\Controllers\Api\V1\Admin\ChatInboxController;
use App\Http\Controllers\Api\V1\Admin\PopupRuleController;
use App\Http\Controllers\Api\V1\Admin\TrainingController;
use App\Http\Controllers\Api\V1\Admin\VoiceAgentController;
use App\Http\Controllers\Api\V1\Widget\WidgetChatController;
use Illuminate\Support\Facades\Route;

// ─── Internal (server-to-server, HMAC-signed) ───────────────────────────
// Used by the SaaS platform's super-admin AI Profitability page to read
// per-org AI usage. NOT versioned — see InternalAiUsageController for
// the auth/payload spec.
Route::prefix('internal/ai-usage')->group(function () {
    Route::post('by-saas-orgs', [\App\Http\Controllers\Api\Internal\InternalAiUsageController::class, 'byOrgs']);
    Route::post('series',       [\App\Http\Controllers\Api\Internal\InternalAiUsageController::class, 'series']);
});

// Used by the SaaS Stripe webhook handler to push entitlement-cache
// busts on plan change (upgrade / downgrade / cancel) so the
// 5-minute SaasAuthMiddleware sync window collapses to "next
// request after webhook lands". See InternalEntitlementController
// for the auth/payload spec.
Route::prefix('internal/entitlements')->group(function () {
    Route::post('bust', [\App\Http\Controllers\Api\Internal\InternalEntitlementController::class, 'bust']);
});

Route::prefix('v1')->group(function () {

    // ─── Public ──────────────────────────────────────────────────────────────────
    Route::get('theme', [SettingsController::class, 'theme']);

    // Public sign-up context. The join link carries the org's widget_token
    // so a member-facing registration page knows which programme it is
    // enrolling someone into — see PublicJoinController.
    Route::get('public/join/{token}', [\App\Http\Controllers\Api\V1\PublicJoinController::class, 'show']);

    // Auth routes — rate-limited to prevent brute-force.
    //
    // Outer throttle covers the whole prefix; inner throttles tighten the
    // specifically-abusable verbs. The previous 10/min/IP shared bucket
    // tripped legit users: a normal signup hits register + send-code +
    // verify-code + activate (4 calls), and a single typo'd login retry
    // burned through the rest. Behind a corporate NAT or family wifi a
    // real user would see "Too Many Attempts" without doing anything wrong.
    //
    // New shape:
    //   - 60/min/IP outer: room for normal flows + a few retries.
    //   - login / claim: 8/min — brute-force surface, kept tight.
    //   - forgot-password / reset-password: 5/min — same.
    //   - trial: 12/min in its OWN bucket — org creation, see below.
    //   - everything else (register, send-code, verify-code, activate):
    //     uses just the outer 60/min, since they all require a fresh email
    //     code or are idempotent and don't expose credentials.
    //
    // NOTE on the third throttle argument. `throttle:N,1` builds its cache
    // key from the DOMAIN + IP only — the route URI is not part of it — so
    // two prefix-less throttles on one route resolve to the SAME key and
    // each calls hit() on it. Stacking a bare `throttle:10,1` inside this
    // 60/min group therefore did NOT mean "10 per minute on this route": it
    // meant "5 per minute, counted against every other anonymous throttled
    // endpoint on the host". Passing a third argument gives the inner limit
    // its own bucket. Any inner throttle added here must pass one.
    Route::prefix('auth')->middleware('throttle:60,1')->group(function () {
        // NOT rate-limited beyond the outer 60/min. Despite the name this is
        // loyalty MEMBER self-enrolment via a venue's join link (see
        // PortalJoin.tsx) — not org creation. Guests signing up at a venue
        // share that venue's wifi IP, so a per-IP cap here throttles the
        // programme's main acquisition path: 20 people joining at an event
        // is normal traffic, not abuse.
        Route::post('register',    [AuthController::class, 'register']);
        Route::post('login',       [AuthController::class, 'login'])->middleware('throttle:8,1');
        // Org CREATION — the expensive verb. Each call provisions a
        // property, tier ladder, pipeline, planner, chat widget and a
        // welcome email, so it gets a dedicated bucket rather than sharing
        // the anonymous counter.
        //
        // 12/min/IP: a human completes ONE trial, and the endpoint is
        // reached only after an emailed code, so this is far above genuine
        // use (including the deliberate resubmit path in startTrial, where
        // a slow first attempt can legitimately be retried) while keeping
        // bulk org creation impractical.
        Route::post('trial',       [AuthController::class, 'startTrial'])->middleware('throttle:12,1,trial');
        Route::post('send-code',        [AuthController::class, 'sendVerificationCode']);
        Route::post('verify-code',      [AuthController::class, 'verifyCode']);
        Route::post('forgot-password',  [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
        Route::post('reset-password',   [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
        Route::post('activate',         [AuthController::class, 'activateAccount']);
        Route::post('claim',            [AuthController::class, 'claimAccount'])->middleware('throttle:8,1');
    });

    // Public: fetch available plans from SaaS
    Route::get('plans', [AuthController::class, 'plans']);

    // Public: email open-tracking pixel (no auth, no tenant scope)
    Route::get('track/open/{recipient}', [CampaignTrackingController::class, 'open']);

    // ─── Public Booking Widget API ──────────────────────────────────────────
    // Apple Wallet pkpass — public route, because a Safari navigation to the
    // .pkpass URL can't carry an Authorization header. It authenticates with a
    // single-use ?pass= nonce minted by the authenticated
    // member/card/apple-wallet/link endpoint (see WalletPassController).
    // It used to accept a raw Sanctum token as ?token=; that put a
    // never-expiring credential into access logs and browser history, and is
    // gone.
    // NOTE: this route sits inside Route::prefix('v1') above, so the path
    // is just 'member/...' — adding 'v1/' here would produce /api/v1/v1/...
    Route::get('member/card/apple-wallet', [\App\Http\Controllers\Api\V1\Member\WalletPassController::class, 'apple']);

Route::prefix('booking')->middleware('throttle:60,1')->group(function () {
        Route::get('config',                [BookingPublicController::class, 'config']);
        Route::get('availability',          [BookingPublicController::class, 'availability']);
        Route::get('unit/{unitId}/rates',   [BookingPublicController::class, 'unitRates']);
        Route::post('quote',                [BookingPublicController::class, 'quote']);
        // Tighter throttle on the money-moving endpoints so a brute-force
        // attacker can't burn through the 60/min shared bucket and starve
        // legit guests. 30/min per IP — wide enough for a fumbled human
        // checkout (validation retries, back-nav, reloads), still narrow
        // enough to blunt abuse.
        Route::post('payment-intent', [BookingPublicController::class, 'paymentIntent'])->middleware('throttle:30,1');
        Route::post('confirm',        [BookingPublicController::class, 'confirm'])->middleware('throttle:30,1');
        Route::get('calendar-prices',       [BookingPublicController::class, 'calendarPrices']);
        Route::post('webhooks/stripe',      [BookingPublicController::class, 'stripeWebhook']);
        Route::post('webhooks/smoobu',      [BookingPublicController::class, 'webhook']);
    });

    // The Amazon SES bounce/complaint webhook is deliberately absent here.
    // Its route reached production in ee2c5c0bb ahead of the controller that
    // serves it -- the class ships with the email/deliverability work, which
    // is still unreleased -- so POST /api/v1/webhooks/ses answered 500 rather
    // than accepting SNS notifications. Re-add the route in the same change
    // that ships App\Http\Controllers\Api\V1\Webhooks\SesWebhookController,
    // never before it.

    // ─── Public Services Reservation Widget API ─────────────────────────────
    Route::prefix('services')->middleware('throttle:60,1')->group(function () {
        Route::get('config',          [ServicePublicController::class, 'config']);
        Route::get('availability',    [ServicePublicController::class, 'availability']);
        Route::get('calendar',        [ServicePublicController::class, 'calendar']);
        Route::post('quote',          [ServicePublicController::class, 'quote']);
        // Same money-moving throttle as the booking widget (30/min).
        Route::post('payment-intent', [ServicePublicController::class, 'paymentIntent'])->middleware('throttle:30,1');
        Route::post('confirm',        [ServicePublicController::class, 'confirm'])->middleware('throttle:30,1');
    });

    // ─── Public Review API ─────────────────────────────────────────────────────
    Route::prefix('public/reviews')->middleware('throttle:60,1')->group(function () {
        Route::get('token/{token}',           [ReviewPublicController::class, 'byToken']);
        Route::get('form/{id}',               [ReviewPublicController::class, 'byFormKey']);
        Route::post('token/{token}',          [ReviewPublicController::class, 'submitByToken'])->middleware('throttle:10,1');
        Route::post('form/{id}',              [ReviewPublicController::class, 'submitByFormKey'])->middleware('throttle:10,1');
        Route::post('{submissionId}/redirected', [ReviewPublicController::class, 'markRedirected']);
        // Kiosk assignment resolution + heartbeat (device polls every 60s).
        Route::get('device/{deviceKey}',      [ReviewPublicController::class, 'deviceResolve']);
    });

    // ─── Public Meta (Facebook/Instagram/WhatsApp) Webhooks ────────────────────
    // Phase 1: Messenger only. Webhook routes are public — Meta doesn't auth,
    // identity is verified inside the controller via:
    //   GET  → matching ?hub.verify_token against META_WEBHOOK_VERIFY_TOKEN
    //   POST → HMAC-SHA256 of raw body against META_APP_SECRET
    // Throttle is wide (300/min) because Meta can batch up to 1000 events per
    // POST during traffic spikes and replays after a re-enable can hammer us
    // legitimately for a minute or two.
    Route::prefix('widget/webhooks')->middleware('throttle:300,1')->group(function () {
        Route::get('messenger',  [\App\Http\Controllers\Api\V1\Widget\MessengerWebhookController::class, 'verify']);
        Route::post('messenger', [\App\Http\Controllers\Api\V1\Widget\MessengerWebhookController::class, 'receive']);
    });

    // ─── Public Chat Widget API ────────────────────────────────────────────────
    // Outer throttle is generous (200/min) because polling alone is ~17/min per
    // open chat. Per-endpoint inner throttles cap the costly OpenAI / write
    // calls to keep abuse contained without breaking normal use.
    //
    // Every inner throttle carries a THIRD argument, and must. Laravel keys an
    // unnamed throttle for a guest on sha1(domain|ip) — the route plays no part
    // — so the nested limiters here all shared ONE counter with each other and
    // with the outer 200/min. The effect was the opposite of what the numbers
    // suggest: a visitor holding a normal conversation spent the /lead and
    // /rate budgets within seconds, so those endpoints answered 429 in ordinary
    // use, while the tight caps they were meant to impose never bound anything
    // in particular. The third argument prefixes the cache key and gives each
    // endpoint the independent bucket the numbers already implied.
    Route::prefix('widget')->middleware('throttle:200,1')->group(function () {
        Route::get('{widgetKey}/config',    [WidgetChatController::class, 'getConfig']);
        Route::post('{widgetKey}/init',     [WidgetChatController::class, 'initSession']);
        Route::post('{widgetKey}/message',  [WidgetChatController::class, 'sendMessage'])->middleware('throttle:60,1,widget-message');
        Route::post('{widgetKey}/lead',     [WidgetChatController::class, 'captureLead'])->middleware('throttle:5,1,widget-lead');
        Route::post('{widgetKey}/heartbeat',  [WidgetChatController::class, 'heartbeat']);
        Route::get('{widgetKey}/poll',        [WidgetChatController::class, 'poll']);
        Route::post('{widgetKey}/typing',     [WidgetChatController::class, 'visitorTyping']);
        Route::post('{widgetKey}/rate',       [WidgetChatController::class, 'rateConversation'])->middleware('throttle:5,1,widget-rate');
        Route::post('{widgetKey}/transcribe', [WidgetChatController::class, 'transcribe'])->middleware('throttle:30,1,widget-transcribe');
        Route::post('{widgetKey}/page-view',  [WidgetChatController::class, 'pageView']);
        Route::get('{widgetKey}/popup-rules', [WidgetChatController::class, 'getPopupRules']);
        Route::post('{widgetKey}/popup-impression', [WidgetChatController::class, 'popupImpression'])->middleware('throttle:30,1,widget-popup');
        Route::post('{widgetKey}/realtime-session', [WidgetChatController::class, 'createRealtimeSession'])->middleware('throttle:30,1,widget-realtime');

        // Booking integration — public room catalog + availability for chat widget
        Route::get('{widgetKey}/rooms',           [WidgetChatController::class, 'getRooms']);
        Route::get('{widgetKey}/availability',    [WidgetChatController::class, 'checkAvailability'])->middleware('throttle:30,1,widget-availability');
        Route::get('{widgetKey}/calendar-prices', [WidgetChatController::class, 'widgetCalendarPrices'])->middleware('throttle:30,1,widget-calendar');

        // In-chat service booking — tapped from [BOOKING_CONFIRM] card
        Route::post('{widgetKey}/book-service',   [WidgetChatController::class, 'bookService'])->middleware('throttle:10,1,widget-book');
    });

    // ─── Public Lead-Capture Forms (CRM Phase 10) ──────────────────────
    // Throttle is generous on read (the iframe page hits config) but
    // strict on submit to keep spam in check. embed_key is the only
    // gate — admins regenerate it from the editor when leaked.
    Route::prefix('public/lead-forms')->middleware('throttle:200,1')->group(function () {
        Route::get('{embedKey}',         [LeadFormPublicController::class, 'show']);
        Route::post('{embedKey}/submit', [LeadFormPublicController::class, 'submit'])->middleware('throttle:5,1,leadform-submit');
    });

    // ─── External integration API (Sanctum personal access tokens) ──────────
    // For third-party systems (FDS Card Builder, Zapier, custom integrations)
    // pushing leads or other data into the CRM. Auth is the user's personal
    // access token; the token's owner determines which org the data lands in.
    // Deliberately NOT under saas.auth (which expects a SaaS JWT) or brand
    // (leads are org-scoped, not brand-scoped). 60/min cap is generous for
    // legitimate use, tight enough to bound abuse.
    Route::middleware(['auth:sanctum', 'tenant', 'throttle:60,1'])
        ->prefix('integrations')
        ->group(function () {
            Route::post('leads', [\App\Http\Controllers\Api\V1\Integrations\LeadIntakeController::class, 'store']);
        });

    // ─── Authenticated Routes ──────────────────────────────────────────────────
    // SaaS JWT middleware runs first; if valid, logs user in before Sanctum checks
    Route::middleware(['saas.auth', 'auth:sanctum', 'tenant', 'brand', 'throttle:240,1'])->group(function () {

        Route::prefix('auth')->group(function () {
            Route::get('me',            [AuthController::class, 'me']);
            Route::delete('logout',     [AuthController::class, 'logout']);
            Route::post('push-token',   [AuthController::class, 'updatePushToken']);
            Route::get('subscription',  [AuthController::class, 'subscription']);
            // Money-touching billing proxies — each call hits SaaS + Stripe.
            // Inner throttle so a malicious client can't churn Checkout/Portal
            // sessions or otherwise pound the SaaS billing surface, but loose
            // enough to absorb React StrictMode double-renders, navigation
            // re-triggers, and user retries after a transient SaaS hiccup
            // (10/min was too tight — caught real users clicking Subscribe
            // and hitting 429). Outer 120/min group throttle still bounds
            // total session activity.
            Route::post('billing/checkout',    [AuthController::class, 'billingCheckout'])->middleware('throttle:30,1');
            Route::post('billing/activate',    [AuthController::class, 'billingActivate'])->middleware('throttle:30,1');
            Route::post('billing/portal',      [AuthController::class, 'billingPortal'])->middleware('throttle:30,1');
            Route::post('billing/refresh',     [AuthController::class, 'billingRefresh'])->middleware('throttle:60,1');
            Route::post('billing/start-trial', [AuthController::class, 'billingStartTrial'])->middleware('throttle:30,1');
            // Industry Platform Plan Phase 2 — POST /v1/auth/apply-industry
            // re-applies a CRM + Planner preset against the caller's org.
            // Throttled hard (5/min) per token; an admin clicking the
            // Phase 4 mismatch banner OR using the Settings → Industry
            // switcher should never need more than a handful of switches
            // in a short window. The data-safety contract (acknowledge
            // body param) lives in the controller — see applyIndustry().
            Route::post('apply-industry',     [AuthController::class, 'applyIndustry'])->middleware('throttle:5,1');
        });

        // ─── Member Routes ─────────────────────────────────────────────────────
        Route::prefix('member')->group(function () {
            Route::get('profile',           [MemberController::class, 'profile']);
            Route::put('profile',           [MemberController::class, 'updateProfile']);
            // Throttled: this is a credential-verification surface, so it is
            // an oracle for guessing the current password if left open.
            // PUT password is deliberately absent: MemberController::updatePassword
            // ships with the unreleased member work. The route reached production
            // in ee2c5c0bb without it, so an authenticated member changing their
            // password got a 500. Re-add it with the method, not before.
            Route::post('profile/avatar',   [MemberController::class, 'uploadAvatar']);
            Route::delete('account',        [MemberController::class, 'deleteAccount']);
            Route::get('card',              [MemberController::class, 'card']);
            // Mints a single-use, 2-minute URL for the Apple Wallet pass.
            // Authenticated by header, so the member's long-lived Sanctum
            // token never has to travel in a query string (and therefore into
            // access logs and Safari history) the way ?token= does.
            // card/apple-wallet/link is deliberately absent: WalletPassController
            // has apple() but not appleLink(), which ships with the unreleased
            // member work. Same deploy, same failure. Re-add it with the method.
            Route::get('points',            [PointsController::class, 'balance']);
            Route::get('points/history',    [PointsController::class, 'history']);
            // Tier benefits the member holds, and requests for the ones
            // that need a person to say yes. This is what finally fills the
            // BenefitEntitlement queue that ScanController already renders
            // for staff — nothing created a row before.
            Route::get   ('benefits',                     [\App\Http\Controllers\Api\V1\Member\BenefitController::class, 'index']);
            Route::post  ('benefits/{id}/request',        [\App\Http\Controllers\Api\V1\Member\BenefitController::class, 'requestBenefit']);
            Route::delete('benefits/requests/{id}',       [\App\Http\Controllers\Api\V1\Member\BenefitController::class, 'cancelRequest']);
            Route::get('offers',            [OfferController::class, 'index']);
            Route::post('offers/{id}/claim',[OfferController::class, 'claim']);
            Route::get('bookings',          [BookingController::class, 'index']);
            Route::get('bookings/{id}',     [BookingController::class, 'show']);
            // Member-initiated reservation — guest_id auto-resolved from the
            // authenticated LoyaltyMember; status defaults to Pending so
            // staff confirms before it's a counted booking.
            Route::post('reservations',     [\App\Http\Controllers\Api\V1\Member\MemberReservationController::class, 'store']);
            Route::get('referral',              [ReferralController::class, 'index']);
            // Self-serve redemption catalog.
            Route::get('rewards',                  [\App\Http\Controllers\Api\V1\Member\RewardController::class, 'index']);
            Route::get('rewards/{id}',             [\App\Http\Controllers\Api\V1\Member\RewardController::class, 'show']);
            Route::post('rewards/{id}/redeem',     [\App\Http\Controllers\Api\V1\Member\RewardController::class, 'redeem']);
            Route::get('my/redemptions',           [\App\Http\Controllers\Api\V1\Member\RewardController::class, 'myRedemptions']);

            // Google Wallet — JSON response, normal auth.
            Route::get('card/google-wallet',       [\App\Http\Controllers\Api\V1\Member\WalletPassController::class, 'google']);
            // Apple Wallet route lives OUTSIDE this group — see public
            // section below — because Safari navigations can't carry
            // an Authorization header, so it accepts ?token= instead.

            // Hotel Services catalog (read-only browse for member mobile app).
            // Reuses the public widget controller — tenant middleware has already
            // bound the org so bindOrg() is a no-op and returns the same shape.
            Route::get('services',          [ServicePublicController::class, 'config']);
            // Member-initiated service booking — customer fields auto-filled
            // from user, status defaults to pending so staff confirms.
            Route::post('service-bookings', [\App\Http\Controllers\Api\V1\Member\MemberServiceBookingController::class, 'store']);
            // Member-initiated Contact Hotel chat — landings appear in the
            // staff Inbox alongside visitor widget conversations, tagged with
            // the member's tier.
            Route::get('chat',                [\App\Http\Controllers\Api\V1\Member\MemberChatController::class, 'current']);
            Route::post('chat/start',         [\App\Http\Controllers\Api\V1\Member\MemberChatController::class, 'start']);
            Route::get('chat/{id}/messages',  [\App\Http\Controllers\Api\V1\Member\MemberChatController::class, 'messages']);
            Route::post('chat/{id}/messages', [\App\Http\Controllers\Api\V1\Member\MemberChatController::class, 'send']);
            Route::get('notifications',             [MemberNotificationController::class, 'index']);
            Route::post('notifications/read-all',  [MemberNotificationController::class, 'markAllRead']);
            Route::post('notifications/{id}/read', [MemberNotificationController::class, 'markRead']);
        });

        // ─── AI Chatbot ────────────────────────────────────────────────────────
        Route::post('chatbot/message', [ChatbotController::class, 'message']);

        // ─── Admin Routes (staff only) ─────────────────────────────────────────
        Route::prefix('admin')->middleware(['admin', 'check.subscription'])->group(function () {

            // Organization setup
            Route::get('setup/status',       [SetupController::class, 'status']);
            Route::post('setup/initialize',  [SetupController::class, 'initialize']);

            // ─── Ops Diagnostics (super_admin only) ────────────────────────────
            // SaaS connectivity probe — DNS resolve + /up health + /auth/token
            // ping. Replaces the old public /billing/diag, which leaked a JWT
            // signing oracle via ?token=. NO token verification, NO secret
            // length disclosure. Tightly throttled because the probes hit the
            // upstream SaaS API on every call.
            Route::get('diag/billing', [DiagController::class, 'billing'])
                ->middleware(['admin:super_admin', 'throttle:5,1']);

            // ─── Brands (multi-brand portfolio) ────────────────────────────────
            // Phase 1 of the multi-brand rollout. Single-brand orgs keep one
            // auto-created default brand; admins use these endpoints to add a
            // second brand and the SPA brand switcher appears in the header.
            // See apps/loyalty/MULTI_BRAND_PLAN.md.
            Route::get('brands/stats',              [BrandController::class, 'stats']);
            Route::post('brands/{id}/set-default', [BrandController::class, 'setDefault']);
            Route::apiResource('brands',           BrandController::class);

            // ─── Engagement Hub (unified Inbox + Visitors) ─────────────────────
            // Backs the new admin SPA /engagement page. Old /v1/admin/visitors
            // and /v1/admin/conversations endpoints stay live — they power the
            // detail drawer and any deep conversation actions. See
            // apps/loyalty/ENGAGEMENT_HUB_PLAN.md.
            //
            // Pricing v3 gate: Growth+/Enterprise. Visitors + chat-inbox
            // detail endpoints (which power the drawer) intentionally
            // stay open so a downgraded org's existing data remains
            // readable — only the unified hub is gated.
            Route::middleware('feature:engagement')->group(function () {
                Route::get('engagement/feed',           [EngagementController::class, 'feed']);
                Route::get('engagement/kpis',           [EngagementController::class, 'kpis']);
                Route::get('engagement/filter-counts',  [EngagementController::class, 'filterCounts']);
                Route::get('engagement/conversations/{id}/brief', [EngagementController::class, 'brief']);
                // Per-message translation (en/ru/de/fr/es/lv) — used by the
                // EngagementDrawer translate button so agents can read foreign-
                // language chats without leaving the inbox.
                Route::post('engagement/translate',     [EngagementController::class, 'translate']);
            });

            // ─── Per-user preferences (Engagement daily summary opt-in, etc.) ──
            Route::get('me/preferences',            [MeController::class, 'preferences']);
            Route::put('me/preferences',            [MeController::class, 'updatePreferences']);

            // Personal API tokens for external integrations.
            Route::get('api-tokens',                [\App\Http\Controllers\Api\V1\Admin\ApiTokenController::class, 'index']);
            Route::post('api-tokens',               [\App\Http\Controllers\Api\V1\Admin\ApiTokenController::class, 'store']);
            Route::delete('api-tokens/{id}',        [\App\Http\Controllers\Api\V1\Admin\ApiTokenController::class, 'destroy']);

            // Messenger Page connection flow (Phase 3 admin Connect UI).
            // The /list-pages endpoint takes a short-lived user token from
            // the FB JS SDK, exchanges it for long-lived, and returns the
            // user's manageable Pages. /connect creates the account + does
            // the subscribed_apps POST. See MESSENGER_INTEGRATION.md.
            Route::get('integrations/messenger/config',           [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'config']);
            Route::get('integrations/messenger',                  [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'index']);
            Route::post('integrations/messenger/list-pages',      [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'listPages']);
            Route::post('integrations/messenger',                 [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'connect']);
            Route::post('integrations/messenger/{id}/reconnect',  [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'reconnect']);
            Route::post('integrations/messenger/{id}/verify',     [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'verify']);
            // Self-diagnose pipeline + recover actions so admins can
            // figure out "I connected but messages don't arrive" without
            // CLI access. See MessengerIntegrationController for the
            // checklist shape.
            Route::post('integrations/messenger/{id}/diagnose',         [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'diagnose']);
            Route::post('integrations/messenger/{id}/resubscribe',      [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'resubscribe']);
            Route::post('integrations/messenger/{id}/simulate-webhook', [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'simulateWebhook']);
            Route::delete('integrations/messenger/{id}',          [\App\Http\Controllers\Api\V1\Admin\MessengerIntegrationController::class, 'destroy']);

            Route::get('dashboard/summary',       [DashboardController::class, 'summary']);
            Route::get('dashboard/kpis',          [DashboardController::class, 'kpis']);
            Route::get('dashboard/points-chart',   [DashboardController::class, 'pointsChart']);
            Route::get('dashboard/member-growth',  [DashboardController::class, 'memberGrowth']);
            Route::get('dashboard/top-members',    [DashboardController::class, 'topMembers']);
            // ai_insights — sidebar Layout.tsx already hides /ai when
            // the org lacks this feature. Endpoint-level middleware
            // closes the direct-URL / tab-from-notification bypass
            // and stops unrestricted OpenAI calls billing the
            // platform key for non-entitled orgs.
            Route::get('dashboard/ai-insights',      [DashboardController::class, 'aiInsights'])
                ->middleware('feature:ai_insights');
            Route::get('dashboard/week-comparison',  [DashboardController::class, 'weekComparison']);
            Route::get('dashboard/booking-trends',   [DashboardController::class, 'bookingTrends']);
            Route::get('dashboard/arrivals-today',   [DashboardController::class, 'arrivalsToday']);
            Route::get('dashboard/departures-today', [DashboardController::class, 'departuresToday']);
            Route::get('dashboard/inquiries-by-status', [DashboardController::class, 'inquiriesByStatus']);
            Route::get('dashboard/recent-activity',  [DashboardController::class, 'recentActivity']);
            Route::get('dashboard/tasks-due',        [DashboardController::class, 'tasksDue']);
            Route::get('dashboard/birthdays-today',         [DashboardController::class, 'birthdaysToday']);
            Route::get('dashboard/tier-up-candidates',      [DashboardController::class, 'tierUpCandidates']);
            Route::get('dashboard/expiring-points',         [DashboardController::class, 'expiringPoints']);
            Route::get('dashboard/recent-reviews',          [DashboardController::class, 'recentReviews']);
            Route::get('dashboard/pending-submissions',     [DashboardController::class, 'pendingBookingSubmissions']);
            Route::get('dashboard/live-ops',                [DashboardController::class, 'liveOps']);
            Route::get('dashboard/recent-chats',            [DashboardController::class, 'recentChatActivity']);

            Route::post('scan/qr',                [ScanController::class, 'scanQr']);
            Route::post('scan/nfc',               [ScanController::class, 'scanNfc']);
            Route::post('nfc-cards',              [ScanController::class, 'linkNfcCard']);
            Route::post('push-token',             [ScanController::class, 'updateStaffPushToken']);

            // Earn-rate bonus events ("Double points weekend" etc.)
            Route::get('earn-rate-events',                      [\App\Http\Controllers\Api\V1\Admin\EarnRateEventController::class, 'index']);
            Route::post('earn-rate-events',                     [\App\Http\Controllers\Api\V1\Admin\EarnRateEventController::class, 'store']);
            Route::get('earn-rate-events/{id}',                 [\App\Http\Controllers\Api\V1\Admin\EarnRateEventController::class, 'show']);
            Route::put('earn-rate-events/{id}',                 [\App\Http\Controllers\Api\V1\Admin\EarnRateEventController::class, 'update']);
            Route::delete('earn-rate-events/{id}',              [\App\Http\Controllers\Api\V1\Admin\EarnRateEventController::class, 'destroy']);

            Route::get('tiers',                   [TierController::class, 'index']);
            Route::post('tiers',                  [TierController::class, 'store']);
            Route::post('tiers/preview',          [TierController::class, 'preview']);
            Route::put('tiers/{id}',              [TierController::class, 'update']);

            // Wallet pass configuration (Apple + Google) — admin-only.
            // Pricing v3 gate: feature:wallet (Growth+/Enterprise). The
            // member-facing pass-generation endpoint at /v1/member/
            // intentionally stays open so existing members can keep
            // adding their loyalty card to wallet even on a downgraded
            // org — the org just can't configure new certs.
            Route::middleware('feature:wallet')->group(function () {
                Route::get('wallet-config',            [\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'show']);
                Route::put('wallet-config',            [\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'update']);
                Route::post('wallet-config/apple-cert',[\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'uploadAppleCert']);
                Route::post('wallet-config/apple-wwdr',[\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'uploadAppleWwdr']);
                Route::post('wallet-config/google-service-account', [\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'uploadGoogleServiceAccount']);
            });

            // Email broadcast campaigns. Pricing v3 gate: feature:campaigns
            // (Growth+/Enterprise).
            Route::middleware('feature:campaigns')->group(function () {
                Route::get('email-campaigns',                 [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'index']);
                Route::get('email-campaigns/stats',            [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'stats']);
                Route::post('email-campaigns',                 [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'store']);
                Route::get('email-campaigns/{id}',             [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'show']);
                Route::put('email-campaigns/{id}',             [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'update']);
                Route::delete('email-campaigns/{id}',          [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'destroy']);
                Route::post('email-campaigns/{id}/send',       [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'send']);
                Route::post('email-campaigns/{id}/duplicate',  [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'duplicate']);
                // Escape hatches for a send in flight. Without these the
                // only way out of a wedged campaign was duplicate(), which
                // duplicates the deliveries too.
                Route::post('email-campaigns/{id}/cancel',     [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'cancel']);
                Route::post('email-campaigns/{id}/reset',      [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'reset']);
                Route::post('email-campaigns/{id}/test',       [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'test']);
            });

            // ─── AI Content Planner ────────────────────────────────────────────
            // Social media + content generation using existing FAQ/KB knowledge.
            // Setup wizard, strategy generation, calendar, posts, campaigns.
            // Profile + audiences + channels + brand voice CRUD.
            Route::prefix('content-planner')->group(function () {
                // Profile setup & management
                Route::get('profile',                           [\App\Http\Controllers\Api\V1\Admin\ContentPlannerProfileController::class, 'show']);
                Route::post('profile',                          [\App\Http\Controllers\Api\V1\Admin\ContentPlannerProfileController::class, 'store']);
                Route::get('profile/readiness',                 [\App\Http\Controllers\Api\V1\Admin\ContentPlannerProfileController::class, 'readiness']);
                Route::post('profile/quick-setup',              [\App\Http\Controllers\Api\V1\Admin\ContentPlannerProfileController::class, 'quickSetup']);
                Route::put('profile/{id}',                      [\App\Http\Controllers\Api\V1\Admin\ContentPlannerProfileController::class, 'update']);
                Route::post('profile/{id}/refresh-knowledge',   [\App\Http\Controllers\Api\V1\Admin\ContentPlannerProfileController::class, 'refreshKnowledge']);

                // Target audiences
                Route::get('audiences',                         [\App\Http\Controllers\Api\V1\Admin\ContentPlannerAudienceController::class, 'index']);
                Route::post('audiences',                        [\App\Http\Controllers\Api\V1\Admin\ContentPlannerAudienceController::class, 'store']);
                Route::get('audiences/{id}',                    [\App\Http\Controllers\Api\V1\Admin\ContentPlannerAudienceController::class, 'show']);
                Route::put('audiences/{id}',                    [\App\Http\Controllers\Api\V1\Admin\ContentPlannerAudienceController::class, 'update']);
                Route::delete('audiences/{id}',                 [\App\Http\Controllers\Api\V1\Admin\ContentPlannerAudienceController::class, 'destroy']);

                // Social channels
                Route::get('channels',                          [\App\Http\Controllers\Api\V1\Admin\ContentPlannerChannelController::class, 'index']);
                Route::post('channels',                         [\App\Http\Controllers\Api\V1\Admin\ContentPlannerChannelController::class, 'store']);
                Route::get('channels/{id}',                     [\App\Http\Controllers\Api\V1\Admin\ContentPlannerChannelController::class, 'show']);
                Route::put('channels/{id}',                     [\App\Http\Controllers\Api\V1\Admin\ContentPlannerChannelController::class, 'update']);
                Route::delete('channels/{id}',                  [\App\Http\Controllers\Api\V1\Admin\ContentPlannerChannelController::class, 'destroy']);

                // Strategies (AI-generated)
                Route::get('strategies',                        [\App\Http\Controllers\Api\V1\Admin\ContentPlannerStrategyController::class, 'index']);
                Route::post('strategies/generate',              [\App\Http\Controllers\Api\V1\Admin\ContentPlannerStrategyController::class, 'generate']);
                Route::get('strategies/{id}',                   [\App\Http\Controllers\Api\V1\Admin\ContentPlannerStrategyController::class, 'show']);
                Route::put('strategies/{id}',                   [\App\Http\Controllers\Api\V1\Admin\ContentPlannerStrategyController::class, 'update']);
                Route::post('strategies/{id}/set-active',       [\App\Http\Controllers\Api\V1\Admin\ContentPlannerStrategyController::class, 'setActive']);
                Route::delete('strategies/{id}',                [\App\Http\Controllers\Api\V1\Admin\ContentPlannerStrategyController::class, 'destroy']);

                // Calendar generation (AI fills empty date+platform slots)
                Route::post('calendar/generate',                [\App\Http\Controllers\Api\V1\Admin\ContentPlannerCalendarController::class, 'generate']);

                // Posts (AI-generated content)
                Route::get('posts',                             [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'index']);
                Route::post('posts',                            [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'store']);
                Route::get('posts/{id}',                        [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'show']);
                Route::put('posts/{id}',                        [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'update']);
                Route::post('posts/{id}/generate-copy',         [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'generateCopy']);
                Route::post('posts/{id}/generate-alternative',  [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'generateAlternative']);
                Route::post('posts/{id}/visual-brief',          [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'visualBrief']);
                Route::post('posts/{id}/generate-image',        [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'generateImage']);
                Route::post('posts/{id}/quality-check',         [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'qualityCheck']);
                Route::post('posts/{id}/mark-ready',            [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'markReady']);
                Route::post('posts/{id}/mark-published',        [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'markPublished']);
                Route::post('posts/{id}/duplicate',             [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'duplicate']);
                Route::delete('posts/{id}',                     [\App\Http\Controllers\Api\V1\Admin\ContentPlannerPostController::class, 'destroy']);
            });

            // Member segments — saved criteria sets + campaign send
            Route::get('segments',                [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'index']);
            Route::post('segments',               [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'store']);
            Route::post('segments/preview',       [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'preview']);
            Route::get('segments/{id}',           [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'show']);
            Route::put('segments/{id}',           [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'update']);
            Route::delete('segments/{id}',        [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'destroy']);
            Route::post('segments/{id}/send',     [\App\Http\Controllers\Api\V1\Admin\SegmentAdminController::class, 'send']);

            Route::get('referrals',               [\App\Http\Controllers\Api\V1\Admin\ReferralAdminController::class, 'index']);
            Route::get('referrals/stats',         [\App\Http\Controllers\Api\V1\Admin\ReferralAdminController::class, 'stats']);

            // Rewards catalog
            Route::get('rewards',                                       [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'index']);
            Route::get('rewards/redemptions',                           [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'redemptions']);
            // Creating, editing, toggling and deleting rewards is offer management,
            // and was open to any authenticated staff member — a receptionist could
            // delete the catalogue. Reads stay open: helping a member at the counter
            // means being able to see what is on offer and what they redeemed.
            Route::middleware('staff.can:can_manage_offers')->group(function () {
                Route::post('rewards',                                      [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'store']);
                Route::put('rewards/{id}',                                  [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'update']);
                Route::patch('rewards/{id}/toggle',                         [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'toggleActive']);
                Route::delete('rewards/{id}',                               [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'destroy']);
            });

            // Handing a reward over (or cancelling it) is the redemption action.
            Route::middleware('staff.can:can_redeem_points')->group(function () {
                Route::post('rewards/redemptions/{id}/fulfill',             [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'fulfill']);
                Route::post('rewards/redemptions/{id}/cancel',              [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'cancel']);
            });
            Route::get('rewards/{id}',                                  [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'show']);

            Route::get('members',                 [MemberAdminController::class, 'index']);
            Route::get('members/stats',           [MemberAdminController::class, 'stats']);
            Route::get('members/export',          [MemberAdminController::class, 'export']);
            Route::get('members/duplicates',      [\App\Http\Controllers\Api\V1\Admin\MemberMergeController::class, 'suggestions']);
            Route::post('members/merge',          [\App\Http\Controllers\Api\V1\Admin\MemberMergeController::class, 'merge']);
            Route::post('members/bulk-message',   [MemberAdminController::class, 'bulkMessage']);
            Route::post('members/bulk-import',    [MemberAdminController::class, 'bulkImport']);

            // Resumable CSV import. `bulk-import` above still serves small
            // one-shot files; this flow is what a real 5 000-member
            // migration uses — upload once, then drive it in chunks so the
            // operator sees progress and no request ever times out.
            // Static segments are declared before members/{id} so "import"
            // is never captured as a member id.
            Route::get ('members/imports',                  [\App\Http\Controllers\Api\V1\Admin\MemberImportController::class, 'index']);
            Route::post('members/imports/preview',           [\App\Http\Controllers\Api\V1\Admin\MemberImportController::class, 'preview']);
            Route::get ('members/imports/{uuid}',            [\App\Http\Controllers\Api\V1\Admin\MemberImportController::class, 'show']);
            Route::post('members/imports/{uuid}/process',    [\App\Http\Controllers\Api\V1\Admin\MemberImportController::class, 'process']);
            Route::post('members/imports/{uuid}/cancel',     [\App\Http\Controllers\Api\V1\Admin\MemberImportController::class, 'cancel']);
            Route::post('members',                [MemberAdminController::class, 'store']);
            Route::get('members/{id}',            [MemberAdminController::class, 'show']);
            Route::put('members/{id}',            [MemberAdminController::class, 'update']);
            Route::get('members/{id}/ai-insights',[MemberAdminController::class, 'aiInsights'])
                ->middleware('feature:ai_insights');
            Route::post('members/{id}/resend-welcome', [MemberAdminController::class, 'resendWelcomeEmail']);
            Route::patch('members/{id}/deactivate', [MemberAdminController::class, 'deactivate']);
            Route::delete('members/{id}',        [MemberAdminController::class, 'destroy']);
            Route::get('members/{id}/qr',         [MemberController::class, 'memberQr']);
            Route::post('points/award',           [MemberAdminController::class, 'awardPoints']);
            Route::post('points/redeem',          [MemberAdminController::class, 'redeemPoints']);
            Route::post('points/reverse',         [MemberAdminController::class, 'reverseTransaction']);

            Route::post('nfc/issue',              [NfcController::class, 'issue']);
            Route::delete('nfc/{id}',             [NfcController::class, 'deactivate']);

            // READS stay open to any staff member — the counter needs to see
            // what is on offer. WRITES are gated on can_manage_offers, which
            // the staff table has carried (and TeamController has let admins
            // set) since forever while nothing ever checked it.
            Route::get('offers',                  [OffersAdminController::class, 'index']);
            Route::get('offers/{id}',             [OffersAdminController::class, 'show']);
            Route::middleware('staff.can:can_manage_offers')->group(function () {
                Route::post  ('offers',              [OffersAdminController::class, 'store']);
                Route::post  ('offers/generate-ai',  [OffersAdminController::class, 'generateAiOffer']);
                Route::put   ('offers/{id}',         [OffersAdminController::class, 'update']);
                Route::delete('offers/{id}',         [OffersAdminController::class, 'destroy']);
            });

            // Benefits & fulfillment — same split.
            Route::get('benefits',                             [BenefitAdminController::class, 'index']);
            Route::middleware('staff.can:can_manage_offers')->group(function () {
                Route::post  ('benefits',                      [BenefitAdminController::class, 'store']);
                Route::put   ('benefits/{id}',                 [BenefitAdminController::class, 'update']);
                Route::delete('benefits/{id}',                 [BenefitAdminController::class, 'destroy']);
                Route::post  ('benefits/{id}/toggle',          [BenefitAdminController::class, 'toggle']);
            });
            // ─── Discounts: what a member actually gets off a bill ───
            // The counter-facing side of the benefit/offer engine. `quote`
            // is read-only so staff can re-quote as an order changes;
            // `use-offer` is what finally burns a claim.
            Route::post('discounts/quote',                     [\App\Http\Controllers\Api\V1\Admin\DiscountController::class, 'quote']);
            Route::get ('discounts/members/{memberId}',        [\App\Http\Controllers\Api\V1\Admin\DiscountController::class, 'benefits']);
            Route::post('discounts/offers/{id}/use',           [\App\Http\Controllers\Api\V1\Admin\DiscountController::class, 'useOffer']);

            Route::get('tiers/{tierId}/benefits',              [BenefitAdminController::class, 'tierBenefits']);
            Route::middleware('staff.can:can_manage_offers')->group(function () {
                Route::post  ('tier-benefits',                 [BenefitAdminController::class, 'assignTierBenefit']);
                Route::delete('tier-benefits/{id}',            [BenefitAdminController::class, 'removeTierBenefit']);
            });
            Route::get('entitlements',                         [BenefitAdminController::class, 'entitlements']);
            Route::post('entitlements/{id}/action',            [BenefitAdminController::class, 'actionEntitlement']);

            // Properties & outlets
            Route::get('properties',                           [PropertyAdminController::class, 'index']);
            Route::post('properties',                          [PropertyAdminController::class, 'store']);
            Route::get('properties/{id}',                      [PropertyAdminController::class, 'show']);
            Route::put('properties/{id}',                      [PropertyAdminController::class, 'update']);
            Route::delete('properties/{id}',                   [PropertyAdminController::class, 'destroy']);
            Route::get('properties/{id}/outlets',              [PropertyAdminController::class, 'outlets']);
            Route::post('properties/{id}/outlets',             [PropertyAdminController::class, 'storeOutlet']);
            Route::put('properties/{id}/outlets/{outletId}',   [PropertyAdminController::class, 'updateOutlet']);

            // Campaign segments — intentionally NOT registered.
            //
            // These URIs collided with the member-segment routes above, and
            // because Laravel keeps the LAST registration the Segments page
            // was split across two unrelated models: index/store/show/update/
            // destroy resolved here (campaign_segments) while preview + send
            // still resolved to SegmentAdminController (member_segments).
            //
            // The page was therefore dead — it posts {name, description,
            // definition} and store() below requires `rules`, so every save
            // 422'd — and `send` looked up ids from one table in the other,
            // which is a mis-send waiting to happen. Nothing in the SPA calls
            // CampaignSegmentController; give it distinct URIs before
            // reinstating it.

            // can_view_analytics was stored on staff, edited in the team UI and
            // returned to the client, but enforced nowhere: a receptionist with the
            // flag off could call every endpoint below directly and read revenue,
            // cohort and member data. Same defect can_manage_offers had. Export is
            // inside the gate too — it is the one that leaves the building.
            Route::middleware('staff.can:can_view_analytics')->group(function () {
                Route::get('analytics/export',              [AnalyticsController::class, 'export']);
                Route::get('analytics/overview',             [AnalyticsController::class, 'overview']);
                Route::get('analytics/points',               [AnalyticsController::class, 'points']);
                Route::get('analytics/member-growth',        [AnalyticsController::class, 'memberGrowth']);
                Route::get('analytics/cohort-retention',     [AnalyticsController::class, 'cohortRetention']);
                Route::get('analytics/at-risk-members',      [AnalyticsController::class, 'atRiskMembers']);
                Route::get('analytics/tier-movement',        [AnalyticsController::class, 'tierMovement']);
                Route::get('analytics/revenue',              [AnalyticsController::class, 'revenue']);
                Route::get('analytics/revenue-trend',        [AnalyticsController::class, 'revenueTrend']);
                Route::get('analytics/booking-trends',       [AnalyticsController::class, 'bookingTrends']);
                Route::get('analytics/engagement',           [AnalyticsController::class, 'engagement']);
                Route::get('analytics/points-distribution',  [AnalyticsController::class, 'pointsDistribution']);
                Route::get('analytics/redemption-trend',     [AnalyticsController::class, 'redemptionTrend']);
                Route::get('analytics/booking-metrics',      [AnalyticsController::class, 'bookingMetrics']);
                Route::get('analytics/hotel-ops',            [AnalyticsController::class, 'hotelOps']);
                Route::get('analytics/expiry-forecast',      [AnalyticsController::class, 'expiryForecast']);
                Route::get('analytics/crm-trends',           [AnalyticsController::class, 'crmTrends']);
                Route::get('analytics/inquiry-pipeline',     [AnalyticsController::class, 'inquiryPipeline']);
                Route::get('analytics/inquiry-funnel',       [AnalyticsController::class, 'inquiryFunnel']);
                Route::get('analytics/booking-channels',     [AnalyticsController::class, 'bookingChannels']);
                // Channel attribution (2026-06-12) — marketing + chat + booking source insights.
                Route::get('analytics/marketing-channels',         [AnalyticsController::class, 'marketingChannels']);
                Route::get('analytics/chat-channel-insights',      [AnalyticsController::class, 'chatChannelInsights']);
                Route::get('analytics/booking-source-performance', [AnalyticsController::class, 'bookingSourcePerformance']);
                Route::get('analytics/revenue-comparison',   [AnalyticsController::class, 'revenueComparison']);
                Route::get('analytics/occupancy',            [AnalyticsController::class, 'occupancyTrend']);
                Route::get('analytics/vip-distribution',     [AnalyticsController::class, 'vipDistribution']);
                Route::get('analytics/nationality',          [AnalyticsController::class, 'nationalityBreakdown']);
                Route::get('analytics/venue-utilization',    [AnalyticsController::class, 'venueUtilization']);
                Route::get('analytics/revenue-by-property',  [AnalyticsController::class, 'revenueByProperty']);
                Route::get('analytics/leads-deep',           [AnalyticsController::class, 'leadsDeep']);
                Route::get('analytics/overview-trends',      [AnalyticsController::class, 'overviewTrends']);
            });

            Route::get('campaigns',                       [AdminNotificationController::class, 'index']);
            Route::get('campaigns/{id}',                  [AdminNotificationController::class, 'show']);
            Route::post('campaigns/preview-audience',     [AdminNotificationController::class, 'previewAudience']);
            Route::post('campaigns/send-test',            [AdminNotificationController::class, 'sendTest']);
            Route::post('notifications/campaign',         [AdminNotificationController::class, 'createCampaign']);

            // ─── Reviews ─────────────────────────────────────────────────
            // Pricing v3 gate: feature:reviews (Growth+/Enterprise).
            // Public form submission at /v1/public/reviews/* stays
            // open — existing forms keep accepting submissions even
            // when the admin can't manage them anymore.
            Route::middleware('feature:reviews')->group(function () {
                Route::get('reviews/forms',                      [AdminReviewController::class, 'listForms']);
                Route::post('reviews/forms',                     [AdminReviewController::class, 'createForm']);
                Route::get('reviews/forms/{id}',                 [AdminReviewController::class, 'showForm']);
                Route::put('reviews/forms/{id}',                 [AdminReviewController::class, 'updateForm']);
                Route::delete('reviews/forms/{id}',              [AdminReviewController::class, 'deleteForm']);
                Route::post('reviews/forms/{id}/rotate-key',     [AdminReviewController::class, 'rotateEmbedKey']);
                Route::put('reviews/forms/{id}/questions',       [AdminReviewController::class, 'replaceQuestions']);
                Route::post('reviews/forms/{id}/duplicate',      [AdminReviewController::class, 'duplicateForm']);
                Route::get('reviews/forms/{id}/analytics',       [AdminReviewController::class, 'formAnalytics']);

                // Kiosk devices — register tablets, assign surveys, rotate keys.
                Route::get('reviews/devices',                    [AdminReviewController::class, 'listDevices']);
                Route::post('reviews/devices',                   [AdminReviewController::class, 'createDevice']);
                Route::put('reviews/devices/{id}',               [AdminReviewController::class, 'updateDevice']);
                Route::delete('reviews/devices/{id}',            [AdminReviewController::class, 'deleteDevice']);
                Route::post('reviews/devices/{id}/rotate-key',   [AdminReviewController::class, 'rotateDeviceKey']);
                Route::get('reviews/devices/{id}/qr',            [AdminReviewController::class, 'deviceQr']);

                Route::get('reviews/integrations',               [AdminReviewController::class, 'listIntegrations']);
                Route::post('reviews/integrations',              [AdminReviewController::class, 'upsertIntegration']);
                Route::delete('reviews/integrations/{id}',       [AdminReviewController::class, 'deleteIntegration']);

                Route::get('reviews/submissions',                [AdminReviewController::class, 'listSubmissions']);
                Route::get('reviews/submissions/export',         [AdminReviewController::class, 'exportSubmissions']);
                Route::get('reviews/submissions/{id}',           [AdminReviewController::class, 'showSubmission']);
                Route::put('reviews/submissions/{id}/featured',  [AdminReviewController::class, 'setSubmissionFeatured']);
                Route::get('reviews/stats',                      [AdminReviewController::class, 'stats']);

                Route::get('reviews/invitations',                [AdminReviewController::class, 'listInvitations']);
                Route::get('reviews/invitations/funnel',         [AdminReviewController::class, 'invitationFunnel']);
                Route::post('reviews/invitations',               [AdminReviewController::class, 'sendInvitation']);
            });

            // ─── Email Templates ─────────────────────────────────────────────
            Route::get('email-templates',                  [EmailTemplateController::class, 'index']);
            Route::post('email-templates',                 [EmailTemplateController::class, 'store']);
            Route::get('email-templates/merge-tags',       [EmailTemplateController::class, 'mergeTags']);
            Route::get('email-templates/{id}',             [EmailTemplateController::class, 'show']);
            Route::put('email-templates/{id}',             [EmailTemplateController::class, 'update']);
            Route::delete('email-templates/{id}',          [EmailTemplateController::class, 'destroy']);
            Route::get('email-templates/{id}/preview',     [EmailTemplateController::class, 'preview']);

            Route::get('settings',                        [SettingsController::class, 'index']);
            Route::put('settings',                        [SettingsController::class, 'update']);
            Route::post('settings/logo',                  [SettingsController::class, 'uploadLogo']);
            Route::post('settings/test-integration',      [SettingsController::class, 'testIntegration']);
            Route::get('settings/sync-status',            [SettingsController::class, 'syncStatus']);

            // ─── AI usage (per-org token ledger) ─────────────────────────────
            Route::get('ai-usage/stats',  [\App\Http\Controllers\Api\V1\Admin\AiUsageController::class, 'stats']);
            Route::get('ai-usage/recent', [\App\Http\Controllers\Api\V1\Admin\AiUsageController::class, 'recent']);
            Route::get('ai-usage/series', [\App\Http\Controllers\Api\V1\Admin\AiUsageController::class, 'series']);

            // ─── Chatbot Analytics ──────────────────────────────────────────
            Route::get('chatbot/analytics',                   [\App\Http\Controllers\Api\V1\Admin\ChatbotAnalyticsController::class, 'index']);

            // ─── Chatbot Configuration ───────────────────────────────────────
            // Pricing v3 gate: feature:chatbot (Growth+/Enterprise).
            // The public widget at /v1/widget/* keeps serving from the
            // last-saved config so a downgraded org's chatbot keeps
            // running on their site — only the admin loses the ability
            // to RECONFIGURE it. Same goes for the knowledge base and
            // popup rules below.
            Route::middleware('feature:chatbot')->group(function () {
                Route::get('chatbot-config/behavior',             [ChatbotConfigController::class, 'getBehavior']);
                Route::put('chatbot-config/behavior',             [ChatbotConfigController::class, 'updateBehavior']);
                Route::get('chatbot-config/model',                [ChatbotConfigController::class, 'getModelConfig']);
                Route::put('chatbot-config/model',                [ChatbotConfigController::class, 'updateModelConfig']);
                Route::post('chatbot-config/test-chat',           [ChatbotConfigController::class, 'testChat']);
                Route::post('chatbot-config/probe-model',         [ChatbotConfigController::class, 'probeModel']);
                Route::post('chatbot-config/suggest-keywords',    [ChatbotConfigController::class, 'suggestKeywords']);

                // First-run setup. Inside this group deliberately — it writes
                // behaviour + knowledge, which are gated, so gating the whole
                // flow is what stops it half-succeeding on Starter.
                Route::get('chatbot-onboarding',       [\App\Http\Controllers\Api\V1\Admin\ChatbotOnboardingController::class, 'show']);
                Route::post('chatbot-onboarding',      [\App\Http\Controllers\Api\V1\Admin\ChatbotOnboardingController::class, 'store']);
                Route::post('chatbot-onboarding/skip', [\App\Http\Controllers\Api\V1\Admin\ChatbotOnboardingController::class, 'skip']);
            });

            // ─── Chat Widget Configuration ───────────────────────────────────
            Route::get('widget-config',                       [ChatWidgetConfigController::class, 'show']);
            Route::put('widget-config',                       [ChatWidgetConfigController::class, 'update']);
            Route::post('widget-config/regenerate-key',       [ChatWidgetConfigController::class, 'regenerateKey']);
            Route::post('widget-config/upload-avatar',        [ChatWidgetConfigController::class, 'uploadAvatar']);
            Route::get('widget-config/embed-code',            [ChatWidgetConfigController::class, 'embedCode']);

            // ─── Chat Inbox ──────────────────────────────────────────────────
            Route::get('chat-inbox',                          [ChatInboxController::class, 'index']);
            Route::get('chat-inbox/stats',                    [ChatInboxController::class, 'stats']);
            Route::get('chat-inbox/{id}',                     [ChatInboxController::class, 'show']);
            Route::put('chat-inbox/{id}/assign',              [ChatInboxController::class, 'assign']);
            Route::put('chat-inbox/{id}/status',              [ChatInboxController::class, 'updateStatus']);
            Route::put('chat-inbox/{id}/ai-toggle',           [ChatInboxController::class, 'toggleAi']);
            Route::post('chat-inbox/{id}/messages',           [ChatInboxController::class, 'sendMessage']);
            Route::post('chat-inbox/{id}/capture-lead',       [ChatInboxController::class, 'captureLead']);
            Route::put('chat-inbox/{id}/contact',             [ChatInboxController::class, 'updateContact']);
            Route::post('chat-inbox/messages/{messageId}/feedback', [ChatInboxController::class, 'submitFeedback']);
            Route::post('chat-inbox/{id}/typing',             [ChatInboxController::class, 'setAgentTyping']);
            Route::get('chat-inbox/{id}/poll',                [ChatInboxController::class, 'pollMessages']);
            Route::get('chat-inbox-canned',                   [ChatInboxController::class, 'getCannedResponses']);
            Route::put('chat-inbox-canned',                   [ChatInboxController::class, 'updateCannedResponses']);
            Route::get('chat-inbox-agents',                   [ChatInboxController::class, 'listAgents']);
            Route::post('chat-inbox/{id}/upload',             [ChatInboxController::class, 'uploadAttachment']);
            Route::post('chat-inbox/transcribe',              [ChatInboxController::class, 'transcribe']);
            Route::get('chat-inbox/{id}/transcript',          [ChatInboxController::class, 'transcript']);

            // ─── Visitors (chat widget identities, online/offline, page views)
            Route::get('visitors',                   [\App\Http\Controllers\Api\V1\Admin\VisitorController::class, 'index']);
            Route::get('visitors/{id}',              [\App\Http\Controllers\Api\V1\Admin\VisitorController::class, 'show']);
            Route::post('visitors/{id}/start-chat',  [\App\Http\Controllers\Api\V1\Admin\VisitorController::class, 'startChat']);
            Route::delete('visitors/{id}',           [\App\Http\Controllers\Api\V1\Admin\VisitorController::class, 'destroy']);

            // ─── Popup Automation Rules ──────────────────────────────────────
            // Same gate as chatbot-config — admin can't author new
            // popup rules without the feature, but the existing rules
            // keep firing on the customer's site via the public widget.
            Route::middleware('feature:chatbot')->group(function () {
                Route::get('popup-rules',                         [PopupRuleController::class, 'index']);
                Route::post('popup-rules',                        [PopupRuleController::class, 'store']);
                Route::put('popup-rules/{id}',                    [PopupRuleController::class, 'update']);
                Route::delete('popup-rules/{id}',                 [PopupRuleController::class, 'destroy']);
            });

            // ─── AI Training / Fine-tuning ───────────────────────────────────
            Route::get('training/jobs',                       [TrainingController::class, 'index']);
            Route::post('training/jobs',                      [TrainingController::class, 'store']);
            Route::get('training/jobs/{id}',                  [TrainingController::class, 'show']);
            Route::post('training/jobs/{id}/cancel',          [TrainingController::class, 'cancel']);
            Route::get('training/stats',                      [TrainingController::class, 'stats']);
            Route::post('training/export-data',               [TrainingController::class, 'exportData']);

            // ─── Knowledge Base ──────────────────────────────────────────────
            // Same gate as chatbot-config — the knowledge base feeds
            // the website chatbot's grounding context. Existing
            // knowledge items keep serving the widget on the
            // customer's site post-downgrade; admin just can't add
            // or edit more.
            Route::middleware('feature:chatbot')->group(function () {
                Route::get('knowledge/categories',                [KnowledgeBaseController::class, 'indexCategories']);
                Route::post('knowledge/categories',               [KnowledgeBaseController::class, 'storeCategory']);
                Route::put('knowledge/categories/{id}',           [KnowledgeBaseController::class, 'updateCategory']);
                Route::delete('knowledge/categories/{id}',        [KnowledgeBaseController::class, 'destroyCategory']);
                Route::get('knowledge/items',                     [KnowledgeBaseController::class, 'indexItems']);
                Route::post('knowledge/items',                    [KnowledgeBaseController::class, 'storeItem']);
                Route::put('knowledge/items/{id}',                [KnowledgeBaseController::class, 'updateItem']);
                Route::delete('knowledge/items/{id}',             [KnowledgeBaseController::class, 'destroyItem']);
                Route::get('knowledge/documents',                 [KnowledgeBaseController::class, 'indexDocuments']);
                Route::post('knowledge/documents',                [KnowledgeBaseController::class, 'uploadDocument']);
                Route::delete('knowledge/documents/{id}',         [KnowledgeBaseController::class, 'destroyDocument']);
                Route::post('knowledge/documents/{id}/reprocess', [KnowledgeBaseController::class, 'reprocessDocument']);
                Route::post('knowledge/extract-faqs',             [KnowledgeBaseController::class, 'extractFaqs']);
                Route::post('knowledge/bulk-import-faqs',         [KnowledgeBaseController::class, 'bulkImportFaqs']);
            });

            // ─── Voice Agent ─────────────────────────────────────────────────
            Route::get('voice-agent/config',                    [VoiceAgentController::class, 'show']);
            Route::put('voice-agent/config',                    [VoiceAgentController::class, 'update']);

            // ─── Guest-Member Auto-Link ───────────────────────────────────────
            Route::post('guests/backfill-links',          [GuestController::class, 'backfillLinks']);

            // ─── CRM: Guests ──────────────────────────────────────────────────
            Route::get('guests',                          [GuestController::class, 'index']);
            Route::post('guests',                         [GuestController::class, 'store']);
            Route::get('guests/export',                   [GuestController::class, 'export']);
            Route::get('guests/facets',                   [GuestController::class, 'facets']);
            Route::get('guests/segments',                 [GuestController::class, 'segments']);
            Route::post('guests/segments',                [GuestController::class, 'storeSegment']);
            Route::delete('guests/segments/{segment}',    [GuestController::class, 'destroySegment']);
            Route::get('guests/tags',                     [GuestController::class, 'tags']);
            Route::post('guests/tags',                    [GuestController::class, 'storeTag']);
            Route::delete('guests/tags/{tag}',            [GuestController::class, 'destroyTag']);
            Route::post('guests/bulk-update',             [GuestController::class, 'bulkUpdate']);
            Route::post('guests/bulk-delete',             [GuestController::class, 'bulkDelete']);
            // CRM duplicate detection + merge — mirror of /v1/admin/members/{duplicates,merge}.
            Route::get('guests/duplicates',               [\App\Http\Controllers\Api\V1\Admin\GuestMergeController::class, 'suggestions']);
            Route::post('guests/merge',                   [\App\Http\Controllers\Api\V1\Admin\GuestMergeController::class, 'merge']);

            // Inquiry attachments (proposals, BEOs, contracts, etc.)
            Route::get('inquiries/{inquiry}/attachments',                [\App\Http\Controllers\Api\V1\Admin\InquiryAttachmentController::class, 'index']);
            // Authenticated theme endpoint — preferred over public /v1/theme
            // for admin users because the org binding is guaranteed by the
            // surrounding saas.auth + tenant middleware stack. Public widget
            // routes still call /v1/theme with ?org_id.
            Route::get('branding/theme',                                 [\App\Http\Controllers\Api\V1\Admin\SettingsController::class, 'adminTheme']);
            // Chat conversations linked to this inquiry's guest (2026-06-12).
            Route::get('inquiries/{id}/chat-history',                    [InquiryController::class, 'chatHistory']);
            Route::post('inquiries/{inquiry}/attachments',               [\App\Http\Controllers\Api\V1\Admin\InquiryAttachmentController::class, 'store']);
            Route::delete('inquiries/{inquiry}/attachments/{attachment}',[\App\Http\Controllers\Api\V1\Admin\InquiryAttachmentController::class, 'destroy']);

            // Unified global search (Cmd+K) — guests + inquiries + corporate + reservations
            Route::get('search/global', [\App\Http\Controllers\Api\V1\Admin\GlobalSearchController::class, 'search']);

            // Quick-send: dispatch an EmailTemplate to a single recipient
            Route::post('email-templates/{template}/send', [\App\Http\Controllers\Api\V1\Admin\EmailTemplateController::class, 'sendOnce']);
            // Blast-radius preview for the confirm-delete modal. Declared
            // BEFORE the {guest} show binding so the static segment wins
            // the route-matcher race against numeric ids.
            Route::get('guests/{id}/delete-impact',       [GuestController::class, 'deleteImpact']);
            Route::get('guests/{guest}',                  [GuestController::class, 'show']);
            Route::put('guests/{guest}',                  [GuestController::class, 'update']);
            Route::delete('guests/{guest}',               [GuestController::class, 'destroy']);
            Route::get('guests/{guest}/inquiries',        [GuestController::class, 'inquiries']);
            Route::get('guests/{guest}/reservations',     [GuestController::class, 'reservations']);
            Route::get('guests/{guest}/activities',       [GuestController::class, 'activities']);
            Route::post('guests/{guest}/activities',      [GuestController::class, 'addActivity']);
            Route::post('guests/{guest}/tags',            [GuestController::class, 'syncTags']);

            // ─── CRM: Inquiries (Sales Pipeline) ─────────────────────────────
            Route::get('inquiries/today',                 [InquiryController::class, 'today']);
            Route::get('inquiries/insights',              [InquiryController::class, 'insights']);
            Route::get('inquiries/kpis',                  [InquiryController::class, 'kpis']);

            // ─── CRM: Deals & Fulfillment ────────────────────────────────────
            Route::get('deals',                           [\App\Http\Controllers\Api\V1\Admin\DealController::class, 'index']);
            Route::get('deals/kpis',                      [\App\Http\Controllers\Api\V1\Admin\DealController::class, 'kpis']);
            Route::get('deals/analytics',                 [\App\Http\Controllers\Api\V1\Admin\DealController::class, 'analytics']);
            Route::patch('deals/{id}/stage',              [\App\Http\Controllers\Api\V1\Admin\DealController::class, 'updateStage']);
            Route::patch('deals/{id}/payment',            [\App\Http\Controllers\Api\V1\Admin\DealController::class, 'updatePayment']);
            Route::post('inquiries/bulk',                 [InquiryController::class, 'bulk']);
            Route::get('inquiries',                       [InquiryController::class, 'index']);
            Route::post('inquiries',                      [InquiryController::class, 'store']);
            Route::get('inquiries/export',                [InquiryController::class, 'export']);
            // Blast-radius preview for the confirm-delete modal. Declared
            // BEFORE the {inquiry} show binding so the static segment wins
            // the route-matcher race against numeric ids.
            Route::get('inquiries/{id}/delete-impact',    [InquiryController::class, 'deleteImpact']);
            Route::get('inquiries/{inquiry}',             [InquiryController::class, 'show']);
            Route::put('inquiries/{inquiry}',             [InquiryController::class, 'update']);
            Route::delete('inquiries/{inquiry}',          [InquiryController::class, 'destroy']);
            Route::post('inquiries/{inquiry}/complete-task', [InquiryController::class, 'completeTask']);
            Route::post('inquiries/{inquiry}/log-contact',   [InquiryController::class, 'logContact']);

            // ─── CRM Phase 2: Smart Panel + Won/Lost flows ──────────────
            Route::post('inquiries/{inquiry}/ai-brief',   [InquiryController::class, 'aiBrief']);
            Route::post('inquiries/{inquiry}/won',        [InquiryController::class, 'markWon']);
            Route::post('inquiries/{inquiry}/lost',       [InquiryController::class, 'markLost']);
            Route::get('inquiry-lost-reasons',            [InquiryController::class, 'lostReasons']);

            // ─── CRM Phase 5: AI velocity ─────────────────────────────────
            Route::post('inquiries/{inquiry}/guess-lost-reason', [InquiryController::class, 'guessLostReason']);
            Route::post('inquiries/{inquiry}/draft-proposal',    [InquiryController::class, 'draftProposal']);

            // ─── CRM Phase 1: Activities (timeline) sub-resource ────────
            Route::get('inquiries/{inquiry}/activities',  [ActivityController::class, 'index']);
            Route::post('inquiries/{inquiry}/activities', [ActivityController::class, 'store']);

            // ─── CRM Phase 1: Tasks ──────────────────────────────────────
            Route::get('tasks',                 [TaskController::class, 'index']);
            Route::post('tasks',                [TaskController::class, 'store']);
            Route::put('tasks/{task}',          [TaskController::class, 'update']);
            Route::post('tasks/{task}/complete',[TaskController::class, 'complete']);
            Route::post('tasks/{task}/reopen',  [TaskController::class, 'reopen']);
            Route::delete('tasks/{task}',       [TaskController::class, 'destroy']);

            // ─── CRM Phase 3: Pipelines + stages + lost reasons admin ─────
            Route::get('pipelines',                                    [PipelineController::class, 'index']);
            Route::post('pipelines',                                   [PipelineController::class, 'store']);
            Route::put('pipelines/{pipeline}',                         [PipelineController::class, 'update']);
            Route::delete('pipelines/{pipeline}',                      [PipelineController::class, 'destroy']);
            Route::post('pipelines/{pipeline}/set-default',            [PipelineController::class, 'setDefault']);
            Route::post('pipelines/{pipeline}/stages',                 [PipelineController::class, 'storeStage']);
            Route::post('pipelines/{pipeline}/stages/reorder',         [PipelineController::class, 'reorderStages']);
            Route::put('pipeline-stages/{stage}',                      [PipelineController::class, 'updateStage']);
            Route::delete('pipeline-stages/{stage}',                   [PipelineController::class, 'destroyStage']);

            Route::get('inquiry-lost-reasons-admin',                   [PipelineController::class, 'indexLostReasons']);
            Route::post('inquiry-lost-reasons',                        [PipelineController::class, 'storeLostReason']);
            Route::put('inquiry-lost-reasons/{reason}',                [PipelineController::class, 'updateLostReason']);
            Route::delete('inquiry-lost-reasons/{reason}',             [PipelineController::class, 'destroyLostReason']);

            // ─── CRM Phase 3: Saved views (per-user, per-page) ────────────
            Route::get('saved-views',                                  [SavedViewController::class, 'index']);
            Route::post('saved-views',                                 [SavedViewController::class, 'store']);
            Route::put('saved-views/{view}',                           [SavedViewController::class, 'update']);
            Route::delete('saved-views/{view}',                        [SavedViewController::class, 'destroy']);

            // ─── CRM Phase 7: Custom fields (per-entity, per-org) ─────────
            Route::get('custom-fields',                 [CustomFieldController::class, 'index']);
            Route::post('custom-fields',                [CustomFieldController::class, 'store']);
            Route::put('custom-fields/{field}',         [CustomFieldController::class, 'update']);
            Route::delete('custom-fields/{field}',      [CustomFieldController::class, 'destroy']);
            Route::post('custom-fields/reorder',        [CustomFieldController::class, 'reorder']);
            Route::post('custom-fields/apply-preset',   [CustomFieldController::class, 'applyPreset']);
            Route::get('custom-fields/presets',         [CustomFieldController::class, 'presets']);

            // ─── CRM Phase 9: One-click industry setup ────────────────────
            Route::get('industry-presets',              [IndustryPresetController::class, 'index']);
            Route::post('industry-presets/apply',       [IndustryPresetController::class, 'apply']);

            // ─── Planner industry presets (groups + templates) ────────────
            Route::get('planner-presets',               [PlannerPresetController::class, 'index']);
            Route::post('planner-presets/apply',        [PlannerPresetController::class, 'apply']);

            // ─── Loyalty / Membership presets (tiers + benefits) ──────────
            Route::get('loyalty-presets',               [LoyaltyPresetController::class, 'index']);
            Route::post('loyalty-presets/apply',        [LoyaltyPresetController::class, 'apply']);
            Route::post('loyalty-presets/skip',         [LoyaltyPresetController::class, 'skip']);

            // ─── Team / staff management ─────────────────────────────────
            Route::get('team',                            [TeamController::class, 'index']);
            Route::post('team/invite',                    [TeamController::class, 'invite']);
            Route::put('team/{id}',                       [TeamController::class, 'update']);
            Route::patch('team/{id}/deactivate',          [TeamController::class, 'deactivate']);
            Route::patch('team/{id}/reactivate',          [TeamController::class, 'reactivate']);
            Route::post('team/{id}/resend',               [TeamController::class, 'resend']);

            // ─── CRM Phase 10: Embeddable lead-capture forms ─────────────
            Route::get('lead-forms',                            [LeadFormController::class, 'index']);
            Route::post('lead-forms',                           [LeadFormController::class, 'store']);
            Route::get('lead-forms/{leadForm}',                 [LeadFormController::class, 'show']);
            Route::put('lead-forms/{leadForm}',                 [LeadFormController::class, 'update']);
            Route::delete('lead-forms/{leadForm}',              [LeadFormController::class, 'destroy']);
            Route::post('lead-forms/{leadForm}/regenerate-key', [LeadFormController::class, 'regenerateKey']);
            Route::get('lead-forms/{leadForm}/submissions',     [LeadFormController::class, 'submissions']);

            // ─── CRM Phase 4: Reporting ───────────────────────────────────
            Route::get('reporting/forecast',            [ReportingController::class, 'forecast']);
            Route::get('reporting/lost-reasons',        [ReportingController::class, 'lostReasons']);
            Route::get('reporting/source-attribution',  [ReportingController::class, 'sourceAttribution']);
            Route::get('reporting/owner-activity',      [ReportingController::class, 'ownerActivity']);
            Route::get('reporting/company-ltv',         [ReportingController::class, 'companyLtv']);

            // ─── CRM: Reservations ────────────────────────────────────────────
            Route::get('reservations',                       [ReservationController::class, 'index']);
            Route::post('reservations',                      [ReservationController::class, 'store']);
            Route::get('reservations/export',                [ReservationController::class, 'export']);
            Route::get('reservations/{reservation}',         [ReservationController::class, 'show']);
            Route::put('reservations/{reservation}',         [ReservationController::class, 'update']);
            Route::delete('reservations/{reservation}',      [ReservationController::class, 'destroy']);
            Route::post('reservations/{reservation}/check-in',  [ReservationController::class, 'checkIn']);
            Route::post('reservations/{reservation}/check-out', [ReservationController::class, 'checkOut']);

            // ─── CRM: Corporate Accounts ──────────────────────────────────────
            Route::get('corporate-accounts',                          [CorporateAccountController::class, 'index']);
            Route::post('corporate-accounts',                         [CorporateAccountController::class, 'store']);
            Route::get('corporate-accounts/{corporateAccount}',       [CorporateAccountController::class, 'show']);
            Route::put('corporate-accounts/{corporateAccount}',       [CorporateAccountController::class, 'update']);
            Route::delete('corporate-accounts/{corporateAccount}',    [CorporateAccountController::class, 'destroy']);

            // ─── CRM: Planner ─────────────────────────────────────────────────
            // The Time Management Platform (public name; "Planner" internally)
            // is Enterprise-only on the current pricing surface. The
            // `feature:time_management` middleware returns 402 with a
            // structured `feature_locked` body when the caller's plan
            // doesn't include it.
            Route::middleware('feature:time_management')->group(function () {
                Route::get('planner/tasks',                   [PlannerController::class, 'tasks']);
                Route::post('planner/tasks',                  [PlannerController::class, 'storeTask']);
                Route::post('planner/tasks/bulk',             [PlannerController::class, 'bulk']);
                Route::put('planner/tasks/{task}',            [PlannerController::class, 'updateTask']);
                Route::delete('planner/tasks/{task}',         [PlannerController::class, 'destroyTask']);
                Route::patch('planner/tasks/{task}/move',     [PlannerController::class, 'moveTask']);
                Route::post('planner/tasks/{task}/copy',      [PlannerController::class, 'copyTask']);
                Route::patch('planner/tasks/{task}/complete', [PlannerController::class, 'toggleComplete']);
                Route::patch('planner/tasks/{task}/status',   [PlannerController::class, 'quickStatus']);
                Route::post('planner/tasks/{task}/subtasks',  [PlannerController::class, 'storeSubtask']);
                Route::patch('planner/subtasks/{subtask}/toggle', [PlannerController::class, 'toggleSubtask']);
                Route::delete('planner/subtasks/{subtask}',   [PlannerController::class, 'destroySubtask']);
                Route::get('planner/day-note',                [PlannerController::class, 'dayNote']);
                Route::post('planner/day-note',               [PlannerController::class, 'upsertDayNote']);
                Route::get('planner/stats',                   [PlannerController::class, 'stats']);
                // Auto-plan — fits today's unscheduled tasks into the
                // working-hour window in priority order, skipping busy
                // slots. Returns a proposal array; nothing is mutated
                // until the frontend POSTs to /apply.
                Route::post('planner/auto-plan',              [PlannerController::class, 'autoPlanDay']);
                Route::post('planner/auto-plan/apply',        [PlannerController::class, 'autoPlanApply']);
                // Ship 5 — voice-agent day-planning surface
                Route::get('planner/free-slots',              [PlannerController::class, 'freeSlots']);
                Route::post('planner/suggest-staff',          [PlannerController::class, 'suggestStaff']);
                Route::get('planner/workload-week',           [PlannerController::class, 'workloadWeek']);

                // Backlog drawer: unscheduled tasks (task_date IS NULL).
                // scope=mine (default) returns the current user's bucket,
                // scope=pool returns the company-wide open pool that anyone
                // can claim.
                Route::get('planner/backlog',                 [PlannerController::class, 'backlog']);
                Route::post('planner/tasks/{task}/claim',     [PlannerController::class, 'claimTask']);
                Route::post('planner/tasks/{task}/release',   [PlannerController::class, 'releaseTask']);

                // ─── Planner v2: org-wide task templates ──────────────────────
                Route::get('planner/templates',                [PlannerController::class, 'templates']);
                Route::post('planner/templates',               [PlannerController::class, 'storeTemplate']);
                Route::put('planner/templates/{template}',     [PlannerController::class, 'updateTemplate']);
                Route::delete('planner/templates/{template}',  [PlannerController::class, 'destroyTemplate']);
            });

            // ─── CRM: Venues & Event Bookings ─────────────────────────────────
            Route::get('venues',                          [VenueController::class, 'indexVenues']);
            Route::post('venues',                         [VenueController::class, 'storeVenue']);
            Route::put('venues/{venue}',                  [VenueController::class, 'updateVenue']);
            Route::delete('venues/{venue}',               [VenueController::class, 'destroyVenue']);
            Route::get('venues/bookings',                 [VenueController::class, 'indexBookings']);
            Route::get('venues/bookings/calendar',        [VenueController::class, 'calendarBookings']);
            Route::post('venues/bookings',                [VenueController::class, 'storeBooking']);
            Route::put('venues/bookings/{venueBooking}',  [VenueController::class, 'updateBooking']);
            Route::delete('venues/bookings/{venueBooking}', [VenueController::class, 'destroyBooking']);

            // ─── Booking Engine (Admin) ──────────────────────────────────────
            Route::get('bookings/today',                  [BookingAdminController::class, 'today']);
            Route::get('bookings/dashboard',              [BookingAdminController::class, 'dashboard']);
            Route::get('bookings/calendar',               [BookingAdminController::class, 'calendar']);
            Route::get('bookings/submissions',            [BookingAdminController::class, 'submissions']);
            Route::get('bookings/payments',               [BookingAdminController::class, 'payments']);
            Route::post('bookings/sync',                  [BookingAdminController::class, 'syncAll']);
            Route::post('bookings/sync-apartments',       [BookingAdminController::class, 'syncApartments']);
            Route::get('bookings/smoobu-channels',        [BookingAdminController::class, 'smoobuChannels']);
            Route::post('bookings/bulk',                  [BookingAdminController::class, 'bulk']);
            Route::post('bookings/export',                [BookingAdminController::class, 'export']);
            Route::post('bookings/manual',                [BookingAdminController::class, 'manualCreate']);
            Route::patch('bookings/{id}/move',            [BookingAdminController::class, 'move']);
            Route::get('bookings',                        [BookingAdminController::class, 'index']);
            Route::get('bookings/{id}',                   [BookingAdminController::class, 'show']);
            Route::post('bookings/{id}/notes',            [BookingAdminController::class, 'addNote']);
            Route::patch('bookings/{id}/status',          [BookingAdminController::class, 'updateStatus']);
            Route::post('bookings/{id}/refund',           [BookingAdminController::class, 'refund']);
            Route::post('bookings/{id}/sync',             [BookingAdminController::class, 'syncOne']);

            // ─── Booking Rooms & Extras (Admin) ─────────────────────────────
            Route::post('booking-rooms/sync',             [BookingRoomController::class, 'sync']);
            Route::post('booking-rooms/reorder',          [BookingRoomController::class, 'reorder']);
            Route::post('booking-rooms/{id}/remove-gallery', [BookingRoomController::class, 'removeGallery']);
            Route::apiResource('booking-rooms',           BookingRoomController::class);
            Route::apiResource('booking-extras',          BookingExtraController::class);

            // ─── Services Reservation (Admin) ───────────────────────────────
            Route::post('service-categories/reorder',     [ServiceCategoryController::class, 'reorder']);
            Route::apiResource('service-categories',      ServiceCategoryController::class);

            Route::post('services/reorder',               [AdminServiceController::class, 'reorder']);
            Route::post('services/{id}/remove-gallery',   [AdminServiceController::class, 'removeGallery']);
            Route::apiResource('services',                AdminServiceController::class);

            Route::post('service-masters/{id}/time-off',                [ServiceMasterController::class, 'addTimeOff']);
            Route::delete('service-masters/{id}/time-off/{entryId}',    [ServiceMasterController::class, 'removeTimeOff']);
            Route::apiResource('service-masters',         ServiceMasterController::class);

            Route::apiResource('service-extras',          ServiceExtraController::class);

            Route::get('service-bookings/today',          [ServiceBookingController::class, 'today']);
            Route::get('service-bookings/dashboard',      [ServiceBookingController::class, 'dashboard']);
            Route::get('service-bookings/calendar',       [ServiceBookingController::class, 'calendar']);
            Route::get('service-bookings/availability',   [ServiceBookingController::class, 'availability']);
            Route::get('service-bookings/submissions',    [ServiceBookingController::class, 'submissions']);
            Route::post('service-bookings/bulk',          [ServiceBookingController::class, 'bulk']);
            Route::post('service-bookings/export',        [ServiceBookingController::class, 'export']);
            Route::get('service-bookings',                [ServiceBookingController::class, 'index']);
            Route::post('service-bookings',               [ServiceBookingController::class, 'store']);
            Route::get('service-bookings/{id}',           [ServiceBookingController::class, 'show']);
            Route::patch('service-bookings/{id}/status',  [ServiceBookingController::class, 'updateStatus']);
            Route::delete('service-bookings/{id}',        [ServiceBookingController::class, 'destroy']);

            // ─── Audit Logs ──────────────────────────────────────────────────
            Route::get('audit-logs',                      [AuditLogController::class, 'index']);
            Route::get('audit-logs/actions',              [AuditLogController::class, 'actions']);
            Route::get('audit-logs/subject-types',        [AuditLogController::class, 'subjectTypes']);

            // ─── CRM: Settings ────────────────────────────────────────────────
            Route::get('crm-settings',                    [CrmSettingsController::class, 'index']);
            Route::put('crm-settings/{key}',              [CrmSettingsController::class, 'update']);

            // ─── CRM: AI Assistant ────────────────────────────────────────────
            // Staff AI copilot is Enterprise-only on the current pricing
            // surface. The `feature:admin_ai` middleware returns 402 with
            // a structured `feature_locked` body when the caller's plan
            // doesn't include it; CrmAiService::call() carries the same
            // gate as defense-in-depth for any internal/non-HTTP caller.
            Route::middleware('feature:admin_ai')->group(function () {
                Route::get('crm-ai/diagnose',                 [CrmAiController::class, 'diagnose']);
                Route::post('crm-ai/chat',                    [CrmAiController::class, 'chat']);
                Route::post('crm-ai/realtime-session',        [CrmAiController::class, 'createRealtimeSession']);
                // Voice-agent tool execution endpoint — see CrmVoiceToolset.
                // Frontend forwards every realtime function_call event here.
                Route::post('crm-ai/voice-tool',              [CrmAiController::class, 'executeVoiceTool']);
                // Ship 9 — voice usage billing.
                Route::post('crm-ai/voice-usage',             [CrmAiController::class, 'recordVoiceUsage']);
                Route::post('crm-ai/capture-lead',            [CrmAiController::class, 'captureLead']);
                Route::post('crm-ai/capture-member',          [CrmAiController::class, 'captureMember']);
                Route::post('crm-ai/capture-corporate',       [CrmAiController::class, 'captureCorporate']);
                Route::post('crm-ai/capture-guest',           [CrmAiController::class, 'captureGuest']);
            });

            // ─── Landing Pages (site builder) ─────────────────────────────────
            // Enterprise-only. Phase 1 ships no admin UI, so these endpoints
            // ARE the product surface — which is exactly why they carry the
            // gate: `feature:landing_pages` returns 402 with a structured
            // `feature_locked` body when the plan doesn't include it.
            //
            // The public renderer (routes/landing.php) is deliberately NOT
            // gated. Once a page is published it stays on the internet; a
            // customer scanning a QR code on a shopfront is not party to our
            // billing relationship with the tenant.
            //
            // One page per brand — hence no index and no {id} segment; the
            // tenant + brand scopes already pick out the single row.
            Route::prefix('landing-pages')->group(function () {
                // TEARDOWN CARRIES NO BILLING GATE AT ALL, and that is
                // deliberate. There are two of them and they are separate
                // refusals, so ungating one and leaving the other still
                // leaves a tenant stuck published:
                //
                //   - `feature:landing_pages` answered 402 feature_locked
                //     after a downgrade. Hence this route sitting OUTSIDE
                //     the entitlement group below.
                //   - `check.subscription` answers 403 subscription_required
                //     for any org that is not ACTIVE or TRIALING — which is
                //     to say CANCELLED, EXPIRED, PAST_DUE, UNPAID or PAUSED,
                //     i.e. every tenant who has actually left. It sits on
                //     the enclosing `admin` group, so leaving the group is
                //     not enough; it has to be excluded by name. Hence the
                //     withoutMiddleware() below.
                //
                // Either one on its own kept the page serving 200 to the
                // public with the tenant's prices, staff names, phone number
                // and address on it, and the only way off the internet was
                // us running an UPDATE by hand.
                //
                // The entitlement buys the ability to PUBLISH, and the
                // subscription pays for it. Ceasing to pay must never compel
                // a business to stay published: that is their data on our
                // infrastructure, and a billing gate is not a lawful reason
                // to keep serving it. Same reasoning as the public renderer
                // above, pointed the other way.
                //
                // The exclusion is exactly one route wide, and must stay
                // there rather than move up to the prefix group: a dead
                // subscription still may not PUBLISH, and hoisting it would
                // hand the build verbs' refusal to `feature:landing_pages`
                // as a side effect.
                //
                // Everything that is NOT about billing still applies —
                // `saas.auth`, `auth:sanctum`, `tenant` and `admin` all sit
                // on enclosing groups and are untouched by the exclusion,
                // and the controller names no page: it reads the caller's
                // own row through the tenant scope. So this is still a
                // staff-only endpoint that can only reach its own tenant's
                // page. LandingPageEntitlementTest asserts the stack,
                // LandingPageAdminApiTest asserts the cross-tenant refusal
                // at the controller, and LandingPageTeardownTest drives the
                // assembled stack over HTTP: a cancelled org unpublishes,
                // the public host then 404s, and every other refusal —
                // anonymous, non-staff, cross-tenant, and the build verbs'
                // own two gates — still fires.
                Route::post('unpublish', [LandingPageController::class, 'unpublish'])
                    ->withoutMiddleware('check.subscription');

                // `status` carries the same two exclusions, one route below
                // this comment, for the read half of the same story: the
                // admin SPA cannot show a lapsed tenant so much as "your page
                // is live at X" without a call that survives a dead
                // subscription too, and `show()` cannot be reused for it — it
                // carries the full edit surface (theme/content/seo/sections)
                // and stays behind `feature:landing_pages` on purpose. Task
                // 10 shipped `unpublish` reachable with nothing to look at;
                // this is what makes the reduced admin screen possible at
                // all. See LandingPageController::status()'s own docblock for
                // exactly what it does and does not return.
                Route::get('status', [LandingPageController::class, 'status'])
                    ->withoutMiddleware('check.subscription');

                Route::middleware('feature:landing_pages')->group(function () {
                    Route::get('/',            [LandingPageController::class, 'show']);
                    Route::post('/',           [LandingPageController::class, 'store']);
                    Route::put('/',            [LandingPageController::class, 'update']);
                    Route::post('publish',     [LandingPageController::class, 'publish']);
                    Route::post('preview-url', [LandingPageController::class, 'previewUrl']);

                    // THE LIVE PREVIEW (landing phase 3c). Takes the
                    // editor's UNSAVED state, parks it in the cache and
                    // hands back a signed preview URL that renders the real
                    // Blade template from it — see App\Landing\PreviewDraft.
                    // It writes nothing, which is why it sits beside
                    // `preview-url` rather than anywhere near `update`.
                    //
                    // THE THIRD THROTTLE ARGUMENT IS MANDATORY, and this
                    // file's own note at the auth group (line ~126) says
                    // why: an unnamed `throttle:N,1` keys on
                    // sha1(domain|ip) alone, so two prefix-less throttles on
                    // one route resolve to the same bucket and each hits it.
                    //
                    // 60/min: the editor debounces at 600ms and cancels
                    // in-flight requests, so a continuous typist producing a
                    // render on every pause is nowhere near one per second
                    // sustained — and a burst that does cross it degrades
                    // into "showing the last version we could load" in the
                    // pane rather than anything broken. The enclosing group
                    // still caps the whole session at 240/min.
                    Route::post('preview-draft', [LandingPageController::class, 'previewDraft'])
                        ->middleware('throttle:60,1,landing-preview-draft');
                    Route::put('sections',     [LandingPageSectionController::class, 'update']);

                    // Adding and removing a band (the repeatable-sections
                    // round). Both live on the same controller as the
                    // reorder above, because all three answer one question
                    // — which sections does this page have, in what order —
                    // and the invariant they share is only enforceable if
                    // one class owns all of it.
                    //
                    // The DELETE carries its key in the BODY rather than in
                    // the path, matching `DELETE landing-pages/image`'s
                    // `slot` two lines below: the page itself is resolved
                    // from the caller's tenant and brand on every one of
                    // these routes, so the only thing left to name is which
                    // part of it, and naming that two different ways on one
                    // resource is a difference with no meaning behind it.
                    Route::post('sections',    [LandingPageSectionController::class, 'store']);
                    Route::delete('sections',  [LandingPageSectionController::class, 'destroy']);

                    // The photo endpoints (Task 4, media round). Multipart
                    // form data does not parse on a PUT in PHP, so both verbs
                    // are POST/DELETE rather than following update()'s PUT —
                    // the frontend posts FormData for the upload and a plain
                    // JSON body for the removal.
                    Route::post('image',   [LandingPageController::class, 'uploadImage']);
                    Route::delete('image', [LandingPageController::class, 'removeImage']);

                    // The wizard: a GET that prefills it from what the
                    // tenant already has, and a POST that applies the result
                    // in one transaction. Inside the entitlement group with
                    // the rest of the build verbs — it CREATES a page, which
                    // is exactly what the plan pays for.
                    Route::get('onboarding',   [LandingOnboardingController::class, 'show']);
                    Route::post('onboarding',  [LandingOnboardingController::class, 'store']);
                });
            });

            // ─── Documentation ───────────────────────────────────────────────
            Route::get('documentation',                   [\App\Http\Controllers\Api\V1\Admin\DocumentationController::class, 'index']);
            Route::get('documentation/{slug}',            [\App\Http\Controllers\Api\V1\Admin\DocumentationController::class, 'section']);

            // ─── Realtime ────────────────────────────────────────────────────
            Route::get('realtime/poll',                    [RealtimeController::class, 'poll']);
        });
    });

});
