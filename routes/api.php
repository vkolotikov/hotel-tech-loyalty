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
use App\Http\Controllers\Api\V1\Admin\RealtimeController;
use App\Http\Controllers\Api\V1\Admin\SetupController;
use App\Http\Controllers\Api\V1\Admin\BookingAdminController;
use App\Http\Controllers\Api\V1\BookingPublicController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    // ─── Public ──────────────────────────────────────────────────────────────────
    Route::get('theme', [SettingsController::class, 'theme']);

    // Auth routes — rate-limited to prevent brute-force
    Route::prefix('auth')->middleware('throttle:10,1')->group(function () {
        Route::post('register',    [AuthController::class, 'register']);
        Route::post('login',       [AuthController::class, 'login']);
        Route::post('trial',       [AuthController::class, 'startTrial']);
        Route::post('send-code',   [AuthController::class, 'sendVerificationCode']);
        Route::post('verify-code', [AuthController::class, 'verifyCode']);
    });

    // Public: fetch available plans from SaaS
    Route::get('plans', [AuthController::class, 'plans']);

    // ─── Public Booking Widget API ──────────────────────────────────────────
    Route::prefix('booking')->middleware('throttle:60,1')->group(function () {
        Route::get('config',                [BookingPublicController::class, 'config']);
        Route::get('availability',          [BookingPublicController::class, 'availability']);
        Route::get('unit/{unitId}/rates',   [BookingPublicController::class, 'unitRates']);
        Route::post('quote',                [BookingPublicController::class, 'quote']);
        Route::post('confirm',              [BookingPublicController::class, 'confirm']);
        Route::post('webhooks/smoobu',      [BookingPublicController::class, 'webhook']);
    });

    // ─── Authenticated Routes ──────────────────────────────────────────────────
    // SaaS JWT middleware runs first; if valid, logs user in before Sanctum checks
    Route::middleware(['saas.auth', 'auth:sanctum', 'tenant', 'throttle:120,1'])->group(function () {

        Route::prefix('auth')->group(function () {
            Route::get('me',            [AuthController::class, 'me']);
            Route::delete('logout',     [AuthController::class, 'logout']);
            Route::post('push-token',   [AuthController::class, 'updatePushToken']);
            Route::get('subscription',  [AuthController::class, 'subscription']);
        });

        // ─── Member Routes ─────────────────────────────────────────────────────
        Route::prefix('member')->group(function () {
            Route::get('profile',           [MemberController::class, 'profile']);
            Route::put('profile',           [MemberController::class, 'updateProfile']);
            Route::get('card',              [MemberController::class, 'card']);
            Route::post('card/refresh-qr',  [MemberController::class, 'refreshQr']);
            Route::get('points',            [PointsController::class, 'balance']);
            Route::get('points/history',    [PointsController::class, 'history']);
            Route::get('offers',            [OfferController::class, 'index']);
            Route::post('offers/{id}/claim',[OfferController::class, 'claim']);
            Route::get('bookings',          [BookingController::class, 'index']);
            Route::get('bookings/{id}',     [BookingController::class, 'show']);
            Route::get('referral',              [ReferralController::class, 'index']);
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

            Route::post('scan/qr',                [ScanController::class, 'scanQr']);
            Route::post('scan/nfc',               [ScanController::class, 'scanNfc']);
            Route::post('nfc-cards',              [ScanController::class, 'linkNfcCard']);

            Route::get('tiers',                   [TierController::class, 'index']);
            Route::post('tiers',                  [TierController::class, 'store']);
            Route::put('tiers/{id}',              [TierController::class, 'update']);

            Route::get('members',                 [MemberAdminController::class, 'index']);
            Route::get('members/export',          [MemberAdminController::class, 'export']);
            Route::post('members',                [MemberAdminController::class, 'store']);
            Route::get('members/{id}',            [MemberAdminController::class, 'show']);
            Route::put('members/{id}',            [MemberAdminController::class, 'update']);
            Route::get('members/{id}/ai-insights',[MemberAdminController::class, 'aiInsights']);
            Route::post('points/award',           [MemberAdminController::class, 'awardPoints']);
            Route::post('points/redeem',          [MemberAdminController::class, 'redeemPoints']);
            Route::post('points/reverse',         [MemberAdminController::class, 'reverseTransaction']);

            Route::post('nfc/issue',              [NfcController::class, 'issue']);
            Route::delete('nfc/{id}',             [NfcController::class, 'deactivate']);

            Route::get('offers',                  [OffersAdminController::class, 'index']);
            Route::post('offers',                 [OffersAdminController::class, 'store']);
            Route::put('offers/{id}',             [OffersAdminController::class, 'update']);
            Route::delete('offers/{id}',          [OffersAdminController::class, 'destroy']);
            Route::post('offers/generate-ai',     [OffersAdminController::class, 'generateAiOffer']);

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
            Route::post('notifications/campaign',         [AdminNotificationController::class, 'createCampaign']);

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
            Route::get('bookings/dashboard',              [BookingAdminController::class, 'dashboard']);
            Route::get('bookings/calendar',               [BookingAdminController::class, 'calendar']);
            Route::get('bookings/submissions',            [BookingAdminController::class, 'submissions']);
            Route::get('bookings/payments',               [BookingAdminController::class, 'payments']);
            Route::post('bookings/sync',                  [BookingAdminController::class, 'syncAll']);
            Route::get('bookings',                        [BookingAdminController::class, 'index']);
            Route::get('bookings/{id}',                   [BookingAdminController::class, 'show']);
            Route::post('bookings/{id}/notes',            [BookingAdminController::class, 'addNote']);
            Route::patch('bookings/{id}/status',          [BookingAdminController::class, 'updateStatus']);
            Route::post('bookings/{id}/sync',             [BookingAdminController::class, 'syncOne']);

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
            Route::post('crm-ai/capture-lead',            [CrmAiController::class, 'captureLead']);
            Route::post('crm-ai/capture-member',          [CrmAiController::class, 'captureMember']);
            Route::post('crm-ai/capture-corporate',       [CrmAiController::class, 'captureCorporate']);

            // ─── Realtime ────────────────────────────────────────────────────
            Route::get('realtime/poll',                    [RealtimeController::class, 'poll']);
        });
    });

    Route::post('webhooks/booking', function (\Illuminate\Http\Request $request) {
        \Illuminate\Support\Facades\Log::info('Booking webhook', $request->all());
        return response()->json(['received' => true]);
    });
});
