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
use App\Http\Controllers\Api\V1\Admin\ReservationController;
use App\Http\Controllers\Api\V1\Admin\CorporateAccountController;
use App\Http\Controllers\Api\V1\Admin\PlannerController;
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

Route::prefix('v1')->group(function () {

    // ─── Public ──────────────────────────────────────────────────────────────────
    Route::get('theme', [SettingsController::class, 'theme']);

    // Auth routes — rate-limited to prevent brute-force
    Route::prefix('auth')->middleware('throttle:10,1')->group(function () {
        Route::post('register',    [AuthController::class, 'register']);
        Route::post('login',       [AuthController::class, 'login']);
        Route::post('trial',       [AuthController::class, 'startTrial']);
        Route::post('send-code',        [AuthController::class, 'sendVerificationCode']);
        Route::post('verify-code',      [AuthController::class, 'verifyCode']);
        Route::post('forgot-password',  [AuthController::class, 'forgotPassword']);
        Route::post('reset-password',   [AuthController::class, 'resetPassword']);
        Route::post('activate',         [AuthController::class, 'activateAccount']);
        Route::post('claim',            [AuthController::class, 'claimAccount']);
    });

    // Public: fetch available plans from SaaS
    Route::get('plans', [AuthController::class, 'plans']);

    // Public: email open-tracking pixel (no auth, no tenant scope)
    Route::get('track/open/{recipient}', [CampaignTrackingController::class, 'open']);

    // ─── Public Booking Widget API ──────────────────────────────────────────
    Route::prefix('booking')->middleware('throttle:60,1')->group(function () {
        Route::get('config',                [BookingPublicController::class, 'config']);
        Route::get('availability',          [BookingPublicController::class, 'availability']);
        Route::get('unit/{unitId}/rates',   [BookingPublicController::class, 'unitRates']);
        Route::post('quote',                [BookingPublicController::class, 'quote']);
        Route::post('payment-intent',       [BookingPublicController::class, 'paymentIntent']);
        Route::post('confirm',              [BookingPublicController::class, 'confirm']);
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
        Route::post('payment-intent', [ServicePublicController::class, 'paymentIntent']);
        Route::post('confirm',        [ServicePublicController::class, 'confirm']);
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

    // ─── Public diagnostic endpoint (no auth) ────────────────────────────────
    Route::get('billing/diag', [AuthController::class, 'billingDiag']);

    // ─── Authenticated Routes ──────────────────────────────────────────────────
    // SaaS JWT middleware runs first; if valid, logs user in before Sanctum checks
    Route::middleware(['saas.auth', 'auth:sanctum', 'tenant', 'throttle:120,1'])->group(function () {

        Route::prefix('auth')->group(function () {
            Route::get('me',            [AuthController::class, 'me']);
            Route::delete('logout',     [AuthController::class, 'logout']);
            Route::post('push-token',   [AuthController::class, 'updatePushToken']);
            Route::get('subscription',  [AuthController::class, 'subscription']);
            Route::post('billing/checkout',     [AuthController::class, 'billingCheckout']);
            Route::post('billing/activate',    [AuthController::class, 'billingActivate']);
            Route::post('billing/portal',      [AuthController::class, 'billingPortal']);
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

            Route::get('tiers',                   [TierController::class, 'index']);
            Route::post('tiers',                  [TierController::class, 'store']);
            Route::put('tiers/{id}',              [TierController::class, 'update']);

            Route::get('members',                 [MemberAdminController::class, 'index']);
            Route::get('members/export',          [MemberAdminController::class, 'export']);
            Route::get('members/duplicates',      [\App\Http\Controllers\Api\V1\Admin\MemberMergeController::class, 'suggestions']);
            Route::post('members/merge',          [\App\Http\Controllers\Api\V1\Admin\MemberMergeController::class, 'merge']);
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
            Route::get('analytics/booking-channels',     [AnalyticsController::class, 'bookingChannels']);
            Route::get('analytics/revenue-comparison',   [AnalyticsController::class, 'revenueComparison']);
            Route::get('analytics/occupancy',            [AnalyticsController::class, 'occupancyTrend']);
            Route::get('analytics/vip-distribution',     [AnalyticsController::class, 'vipDistribution']);
            Route::get('analytics/nationality',          [AnalyticsController::class, 'nationalityBreakdown']);
            Route::get('analytics/venue-utilization',    [AnalyticsController::class, 'venueUtilization']);
            Route::get('analytics/revenue-by-property',  [AnalyticsController::class, 'revenueByProperty']);

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
            Route::get('inquiries',                       [InquiryController::class, 'index']);
            Route::post('inquiries',                      [InquiryController::class, 'store']);
            Route::get('inquiries/export',                [InquiryController::class, 'export']);
            Route::get('inquiries/{inquiry}',             [InquiryController::class, 'show']);
            Route::put('inquiries/{inquiry}',             [InquiryController::class, 'update']);
            Route::delete('inquiries/{inquiry}',          [InquiryController::class, 'destroy']);
            Route::post('inquiries/{inquiry}/complete-task', [InquiryController::class, 'completeTask']);

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
