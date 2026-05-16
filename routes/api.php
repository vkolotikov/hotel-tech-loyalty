<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Member\MemberController;
use App\Http\Controllers\Api\V1\Member\PointsController;
use App\Http\Controllers\Api\V1\Member\OfferController;
use App\Http\Controllers\Api\V1\Member\BookingController;
use App\Http\Controllers\Api\V1\Member\ReferralController;
use App\Http\Controllers\Api\V1\Chatbot\ChatbotController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
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

Route::prefix('v1')->group(function () {

    // ─── Public ──────────────────────────────────────────────────────────────────
    Route::get('theme', [SettingsController::class, 'theme']);

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
    //   - everything else (register, trial, send-code, verify-code, activate):
    //     uses just the outer 60/min, since they all require a fresh email
    //     code or are idempotent and don't expose credentials.
    Route::prefix('auth')->middleware('throttle:60,1')->group(function () {
        Route::post('register',    [AuthController::class, 'register']);
        Route::post('login',       [AuthController::class, 'login'])->middleware('throttle:8,1');
        Route::post('trial',       [AuthController::class, 'startTrial']);
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
    // Apple Wallet pkpass — public route that accepts a Sanctum token
// via ?token= query because Safari navigations to the .pkpass URL
// can't carry an Authorization header. Token is resolved inside the
// controller using PersonalAccessToken::findToken.
Route::get('v1/member/card/apple-wallet', [\App\Http\Controllers\Api\V1\Member\WalletPassController::class, 'apple']);

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
    });

    // ─── Public Chat Widget API ────────────────────────────────────────────────
    // Outer throttle is generous (200/min) because polling alone is ~17/min per
    // open chat. Per-endpoint inner throttles cap the costly OpenAI / write
    // calls to keep abuse contained without breaking normal use.
    Route::prefix('widget')->middleware('throttle:200,1')->group(function () {
        Route::get('{widgetKey}/config',    [WidgetChatController::class, 'getConfig']);
        Route::post('{widgetKey}/init',     [WidgetChatController::class, 'initSession']);
        Route::post('{widgetKey}/message',  [WidgetChatController::class, 'sendMessage'])->middleware('throttle:60,1');
        Route::post('{widgetKey}/lead',     [WidgetChatController::class, 'captureLead'])->middleware('throttle:5,1');
        Route::post('{widgetKey}/heartbeat',  [WidgetChatController::class, 'heartbeat']);
        Route::get('{widgetKey}/poll',        [WidgetChatController::class, 'poll']);
        Route::post('{widgetKey}/typing',     [WidgetChatController::class, 'visitorTyping']);
        Route::post('{widgetKey}/rate',       [WidgetChatController::class, 'rateConversation'])->middleware('throttle:5,1');
        Route::post('{widgetKey}/upload',     [WidgetChatController::class, 'uploadAttachment'])->middleware('throttle:10,1');
        Route::post('{widgetKey}/transcribe', [WidgetChatController::class, 'transcribe'])->middleware('throttle:30,1');
        Route::post('{widgetKey}/page-view',  [WidgetChatController::class, 'pageView']);
        Route::get('{widgetKey}/popup-rules', [WidgetChatController::class, 'getPopupRules']);
        Route::post('{widgetKey}/popup-impression', [WidgetChatController::class, 'popupImpression'])->middleware('throttle:30,1');
        Route::post('{widgetKey}/realtime-session', [WidgetChatController::class, 'createRealtimeSession'])->middleware('throttle:30,1');

        // Booking integration — public room catalog + availability for chat widget
        Route::get('{widgetKey}/rooms',           [WidgetChatController::class, 'getRooms']);
        Route::get('{widgetKey}/availability',    [WidgetChatController::class, 'checkAvailability'])->middleware('throttle:30,1');
        Route::get('{widgetKey}/calendar-prices', [WidgetChatController::class, 'widgetCalendarPrices'])->middleware('throttle:30,1');

        // In-chat service booking — tapped from [BOOKING_CONFIRM] card
        Route::post('{widgetKey}/book-service',   [WidgetChatController::class, 'bookService'])->middleware('throttle:10,1');
    });

    // ─── Public Lead-Capture Forms (CRM Phase 10) ──────────────────────
    // Throttle is generous on read (the iframe page hits config) but
    // strict on submit to keep spam in check. embed_key is the only
    // gate — admins regenerate it from the editor when leaked.
    Route::prefix('public/lead-forms')->middleware('throttle:200,1')->group(function () {
        Route::get('{embedKey}',         [LeadFormPublicController::class, 'show']);
        Route::post('{embedKey}/submit', [LeadFormPublicController::class, 'submit'])->middleware('throttle:5,1');
    });

    // ─── Public diagnostic endpoint (no auth) ────────────────────────────────
    Route::get('billing/diag', [AuthController::class, 'billingDiag']);

    // ─── Authenticated Routes ──────────────────────────────────────────────────
    // SaaS JWT middleware runs first; if valid, logs user in before Sanctum checks
    Route::middleware(['saas.auth', 'auth:sanctum', 'tenant', 'brand', 'throttle:120,1'])->group(function () {

        Route::prefix('auth')->group(function () {
            Route::get('me',            [AuthController::class, 'me']);
            Route::delete('logout',     [AuthController::class, 'logout']);
            Route::post('push-token',   [AuthController::class, 'updatePushToken']);
            Route::get('subscription',  [AuthController::class, 'subscription']);
            Route::post('billing/checkout',     [AuthController::class, 'billingCheckout']);
            Route::post('billing/activate',    [AuthController::class, 'billingActivate']);
            Route::post('billing/portal',      [AuthController::class, 'billingPortal']);
            Route::post('billing/refresh',     [AuthController::class, 'billingRefresh']);
            Route::post('billing/start-trial', [AuthController::class, 'billingStartTrial']);
        });

        // ─── Member Routes ─────────────────────────────────────────────────────
        Route::prefix('member')->group(function () {
            Route::get('profile',           [MemberController::class, 'profile']);
            Route::put('profile',           [MemberController::class, 'updateProfile']);
            Route::post('profile/avatar',   [MemberController::class, 'uploadAvatar']);
            Route::delete('account',        [MemberController::class, 'deleteAccount']);
            Route::get('card',              [MemberController::class, 'card']);
            Route::get('points',            [PointsController::class, 'balance']);
            Route::get('points/history',    [PointsController::class, 'history']);
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
            Route::get('engagement/feed',           [EngagementController::class, 'feed']);
            Route::get('engagement/kpis',           [EngagementController::class, 'kpis']);
            Route::get('engagement/filter-counts',  [EngagementController::class, 'filterCounts']);
            Route::get('engagement/conversations/{id}/brief', [EngagementController::class, 'brief']);

            // ─── Per-user preferences (Engagement daily summary opt-in, etc.) ──
            Route::get('me/preferences',            [MeController::class, 'preferences']);
            Route::put('me/preferences',            [MeController::class, 'updatePreferences']);

            Route::get('dashboard/summary',       [DashboardController::class, 'summary']);
            Route::get('dashboard/kpis',          [DashboardController::class, 'kpis']);
            Route::get('dashboard/points-chart',   [DashboardController::class, 'pointsChart']);
            Route::get('dashboard/member-growth',  [DashboardController::class, 'memberGrowth']);
            Route::get('dashboard/top-members',    [DashboardController::class, 'topMembers']);
            Route::get('dashboard/ai-insights',      [DashboardController::class, 'aiInsights']);
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

            // Wallet pass configuration (Apple + Google)
            Route::get('wallet-config',            [\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'show']);
            Route::put('wallet-config',            [\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'update']);
            Route::post('wallet-config/apple-cert',[\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'uploadAppleCert']);
            Route::post('wallet-config/apple-wwdr',[\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'uploadAppleWwdr']);
            Route::post('wallet-config/google-service-account', [\App\Http\Controllers\Api\V1\Admin\WalletConfigController::class, 'uploadGoogleServiceAccount']);

            // Email broadcast campaigns
            Route::get('email-campaigns',                 [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'index']);
            Route::get('email-campaigns/stats',            [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'stats']);
            Route::post('email-campaigns',                 [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'store']);
            Route::get('email-campaigns/{id}',             [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'show']);
            Route::put('email-campaigns/{id}',             [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'update']);
            Route::delete('email-campaigns/{id}',          [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'destroy']);
            Route::post('email-campaigns/{id}/send',       [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'send']);
            Route::post('email-campaigns/{id}/duplicate',  [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'duplicate']);
            Route::post('email-campaigns/{id}/test',       [\App\Http\Controllers\Api\V1\Admin\EmailCampaignController::class, 'test']);

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
            Route::post('rewards/redemptions/{id}/fulfill',             [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'fulfill']);
            Route::post('rewards/redemptions/{id}/cancel',              [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'cancel']);
            Route::post('rewards',                                      [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'store']);
            Route::get('rewards/{id}',                                  [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'show']);
            Route::put('rewards/{id}',                                  [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'update']);
            Route::patch('rewards/{id}/toggle',                         [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'toggleActive']);
            Route::delete('rewards/{id}',                               [\App\Http\Controllers\Api\V1\Admin\RewardAdminController::class, 'destroy']);

            Route::get('members',                 [MemberAdminController::class, 'index']);
            Route::get('members/stats',           [MemberAdminController::class, 'stats']);
            Route::get('members/export',          [MemberAdminController::class, 'export']);
            Route::get('members/duplicates',      [\App\Http\Controllers\Api\V1\Admin\MemberMergeController::class, 'suggestions']);
            Route::post('members/merge',          [\App\Http\Controllers\Api\V1\Admin\MemberMergeController::class, 'merge']);
            Route::post('members/bulk-message',   [MemberAdminController::class, 'bulkMessage']);
            Route::post('members/bulk-import',    [MemberAdminController::class, 'bulkImport']);
            Route::post('members',                [MemberAdminController::class, 'store']);
            Route::get('members/{id}',            [MemberAdminController::class, 'show']);
            Route::put('members/{id}',            [MemberAdminController::class, 'update']);
            Route::get('members/{id}/ai-insights',[MemberAdminController::class, 'aiInsights']);
            Route::post('members/{id}/resend-welcome', [MemberAdminController::class, 'resendWelcomeEmail']);
            Route::patch('members/{id}/deactivate', [MemberAdminController::class, 'deactivate']);
            Route::delete('members/{id}',        [MemberAdminController::class, 'destroy']);
            Route::get('members/{id}/qr',         [MemberController::class, 'memberQr']);
            Route::post('points/award',           [MemberAdminController::class, 'awardPoints']);
            Route::post('points/redeem',          [MemberAdminController::class, 'redeemPoints']);
            Route::post('points/reverse',         [MemberAdminController::class, 'reverseTransaction']);

            Route::post('nfc/issue',              [NfcController::class, 'issue']);
            Route::delete('nfc/{id}',             [NfcController::class, 'deactivate']);

            Route::get('offers',                  [OffersAdminController::class, 'index']);
            Route::post('offers',                 [OffersAdminController::class, 'store']);
            Route::post('offers/generate-ai',     [OffersAdminController::class, 'generateAiOffer']);
            Route::get('offers/{id}',             [OffersAdminController::class, 'show']);
            Route::put('offers/{id}',             [OffersAdminController::class, 'update']);
            Route::delete('offers/{id}',          [OffersAdminController::class, 'destroy']);

            // Benefits & fulfillment
            Route::get('benefits',                             [BenefitAdminController::class, 'index']);
            Route::post('benefits',                            [BenefitAdminController::class, 'store']);
            Route::put('benefits/{id}',                        [BenefitAdminController::class, 'update']);
            Route::delete('benefits/{id}',                     [BenefitAdminController::class, 'destroy']);
            Route::post('benefits/{id}/toggle',                [BenefitAdminController::class, 'toggle']);
            Route::get('tiers/{tierId}/benefits',              [BenefitAdminController::class, 'tierBenefits']);
            Route::post('tier-benefits',                       [BenefitAdminController::class, 'assignTierBenefit']);
            Route::delete('tier-benefits/{id}',                [BenefitAdminController::class, 'removeTierBenefit']);
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

            // Campaign segments
            Route::get('segments',                             [CampaignSegmentController::class, 'index']);
            Route::post('segments',                            [CampaignSegmentController::class, 'store']);
            Route::get('segments/{id}',                        [CampaignSegmentController::class, 'show']);
            Route::put('segments/{id}',                        [CampaignSegmentController::class, 'update']);
            Route::delete('segments/{id}',                     [CampaignSegmentController::class, 'destroy']);
            Route::get('segments/{id}/preview',                [CampaignSegmentController::class, 'preview']);

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
            Route::get('analytics/revenue-comparison',   [AnalyticsController::class, 'revenueComparison']);
            Route::get('analytics/occupancy',            [AnalyticsController::class, 'occupancyTrend']);
            Route::get('analytics/vip-distribution',     [AnalyticsController::class, 'vipDistribution']);
            Route::get('analytics/nationality',          [AnalyticsController::class, 'nationalityBreakdown']);
            Route::get('analytics/venue-utilization',    [AnalyticsController::class, 'venueUtilization']);
            Route::get('analytics/revenue-by-property',  [AnalyticsController::class, 'revenueByProperty']);
            Route::get('analytics/leads-deep',           [AnalyticsController::class, 'leadsDeep']);
            Route::get('analytics/overview-trends',      [AnalyticsController::class, 'overviewTrends']);

            Route::get('campaigns',                       [AdminNotificationController::class, 'index']);
            Route::get('campaigns/{id}',                  [AdminNotificationController::class, 'show']);
            Route::post('campaigns/preview-audience',     [AdminNotificationController::class, 'previewAudience']);
            Route::post('campaigns/send-test',            [AdminNotificationController::class, 'sendTest']);
            Route::post('notifications/campaign',         [AdminNotificationController::class, 'createCampaign']);

            // ─── Reviews ─────────────────────────────────────────────────
            Route::get('reviews/forms',                      [AdminReviewController::class, 'listForms']);
            Route::post('reviews/forms',                     [AdminReviewController::class, 'createForm']);
            Route::get('reviews/forms/{id}',                 [AdminReviewController::class, 'showForm']);
            Route::put('reviews/forms/{id}',                 [AdminReviewController::class, 'updateForm']);
            Route::delete('reviews/forms/{id}',              [AdminReviewController::class, 'deleteForm']);
            Route::post('reviews/forms/{id}/rotate-key',     [AdminReviewController::class, 'rotateEmbedKey']);
            Route::put('reviews/forms/{id}/questions',       [AdminReviewController::class, 'replaceQuestions']);

            Route::get('reviews/integrations',               [AdminReviewController::class, 'listIntegrations']);
            Route::post('reviews/integrations',              [AdminReviewController::class, 'upsertIntegration']);
            Route::delete('reviews/integrations/{id}',       [AdminReviewController::class, 'deleteIntegration']);

            Route::get('reviews/submissions',                [AdminReviewController::class, 'listSubmissions']);
            Route::get('reviews/submissions/export',         [AdminReviewController::class, 'exportSubmissions']);
            Route::get('reviews/submissions/{id}',           [AdminReviewController::class, 'showSubmission']);
            Route::get('reviews/stats',                      [AdminReviewController::class, 'stats']);

            Route::get('reviews/invitations',                [AdminReviewController::class, 'listInvitations']);
            Route::get('reviews/invitations/funnel',         [AdminReviewController::class, 'invitationFunnel']);
            Route::post('reviews/invitations',               [AdminReviewController::class, 'sendInvitation']);

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
            Route::get('chatbot-config/behavior',             [ChatbotConfigController::class, 'getBehavior']);
            Route::put('chatbot-config/behavior',             [ChatbotConfigController::class, 'updateBehavior']);
            Route::get('chatbot-config/model',                [ChatbotConfigController::class, 'getModelConfig']);
            Route::put('chatbot-config/model',                [ChatbotConfigController::class, 'updateModelConfig']);
            Route::post('chatbot-config/test-chat',           [ChatbotConfigController::class, 'testChat']);
            Route::post('chatbot-config/probe-model',         [ChatbotConfigController::class, 'probeModel']);
            Route::post('chatbot-config/suggest-keywords',    [ChatbotConfigController::class, 'suggestKeywords']);

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
            Route::get('popup-rules',                         [PopupRuleController::class, 'index']);
            Route::post('popup-rules',                        [PopupRuleController::class, 'store']);
            Route::put('popup-rules/{id}',                    [PopupRuleController::class, 'update']);
            Route::delete('popup-rules/{id}',                 [PopupRuleController::class, 'destroy']);

            // ─── AI Training / Fine-tuning ───────────────────────────────────
            Route::get('training/jobs',                       [TrainingController::class, 'index']);
            Route::post('training/jobs',                      [TrainingController::class, 'store']);
            Route::get('training/jobs/{id}',                  [TrainingController::class, 'show']);
            Route::post('training/jobs/{id}/cancel',          [TrainingController::class, 'cancel']);
            Route::get('training/stats',                      [TrainingController::class, 'stats']);
            Route::post('training/export-data',               [TrainingController::class, 'exportData']);

            // ─── Knowledge Base ──────────────────────────────────────────────
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

            // ─── Voice Agent ─────────────────────────────────────────────────
            Route::get('voice-agent/config',                    [VoiceAgentController::class, 'show']);
            Route::put('voice-agent/config',                    [VoiceAgentController::class, 'update']);

            // ─── Guest-Member Auto-Link ───────────────────────────────────────
            Route::post('guests/backfill-links',          [GuestController::class, 'backfillLinks']);

            // ─── CRM: Guests ──────────────────────────────────────────────────
            Route::get('guests',                          [GuestController::class, 'index']);
            Route::post('guests',                         [GuestController::class, 'store']);
            Route::get('guests/export',                   [GuestController::class, 'export']);
            Route::get('guests/segments',                 [GuestController::class, 'segments']);
            Route::post('guests/segments',                [GuestController::class, 'storeSegment']);
            Route::delete('guests/segments/{segment}',    [GuestController::class, 'destroySegment']);
            Route::get('guests/tags',                     [GuestController::class, 'tags']);
            Route::post('guests/tags',                    [GuestController::class, 'storeTag']);
            Route::delete('guests/tags/{tag}',            [GuestController::class, 'destroyTag']);
            Route::post('guests/bulk-update',             [GuestController::class, 'bulkUpdate']);
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

            // ─── Planner v2: org-wide task templates ──────────────────────
            Route::get('planner/templates',                [PlannerController::class, 'templates']);
            Route::post('planner/templates',               [PlannerController::class, 'storeTemplate']);
            Route::put('planner/templates/{template}',     [PlannerController::class, 'updateTemplate']);
            Route::delete('planner/templates/{template}',  [PlannerController::class, 'destroyTemplate']);

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
            Route::get('crm-ai/diagnose',                 [CrmAiController::class, 'diagnose']);
            Route::post('crm-ai/chat',                    [CrmAiController::class, 'chat']);
            Route::post('crm-ai/realtime-session',        [CrmAiController::class, 'createRealtimeSession']);
            Route::post('crm-ai/capture-lead',            [CrmAiController::class, 'captureLead']);
            Route::post('crm-ai/capture-member',          [CrmAiController::class, 'captureMember']);
            Route::post('crm-ai/capture-corporate',       [CrmAiController::class, 'captureCorporate']);

            // ─── Documentation ───────────────────────────────────────────────
            Route::get('documentation',                   [\App\Http\Controllers\Api\V1\Admin\DocumentationController::class, 'index']);
            Route::get('documentation/{slug}',            [\App\Http\Controllers\Api\V1\Admin\DocumentationController::class, 'section']);

            // ─── Realtime ────────────────────────────────────────────────────
            Route::get('realtime/poll',                    [RealtimeController::class, 'poll']);
        });
    });

});
