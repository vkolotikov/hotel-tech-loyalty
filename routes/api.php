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
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    // ─── Public ──────────────────────────────────────────────────────────────────
    Route::get('theme', [SettingsController::class, 'theme']);

    Route::prefix('auth')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login',    [AuthController::class, 'login']);
    });

    // ─── Authenticated Routes ──────────────────────────────────────────────────
    // SaaS JWT middleware runs first; if valid, logs user in before Sanctum checks
    Route::middleware(['saas.auth', 'auth:sanctum'])->group(function () {

        Route::prefix('auth')->group(function () {
            Route::get('me',            [AuthController::class, 'me']);
            Route::delete('logout',     [AuthController::class, 'logout']);
            Route::post('push-token',   [AuthController::class, 'updatePushToken']);
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

        // ─── Admin Routes ──────────────────────────────────────────────────────
        Route::prefix('admin')->group(function () {

            Route::get('dashboard/kpis',          [DashboardController::class, 'kpis']);
            Route::get('dashboard/points-chart',   [DashboardController::class, 'pointsChart']);
            Route::get('dashboard/member-growth',  [DashboardController::class, 'memberGrowth']);
            Route::get('dashboard/top-members',    [DashboardController::class, 'topMembers']);
            Route::get('dashboard/ai-insights',      [DashboardController::class, 'aiInsights']);
            Route::get('dashboard/week-comparison',  [DashboardController::class, 'weekComparison']);
            Route::get('dashboard/booking-trends',   [DashboardController::class, 'bookingTrends']);

            Route::post('scan/qr',                [ScanController::class, 'scanQr']);
            Route::post('scan/nfc',               [ScanController::class, 'scanNfc']);
            Route::post('nfc-cards',              [ScanController::class, 'linkNfcCard']);

            Route::get('tiers',                   [TierController::class, 'index']);
            Route::post('tiers',                  [TierController::class, 'store']);
            Route::put('tiers/{id}',              [TierController::class, 'update']);

            Route::get('members',                 [MemberAdminController::class, 'index']);
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

            Route::get('campaigns',                       [AdminNotificationController::class, 'index']);
            Route::post('notifications/campaign',         [AdminNotificationController::class, 'createCampaign']);

            Route::get('settings',                        [SettingsController::class, 'index']);
            Route::put('settings',                        [SettingsController::class, 'update']);
            Route::post('settings/logo',                  [SettingsController::class, 'uploadLogo']);
        });
    });

    Route::post('webhooks/booking', function (\Illuminate\Http\Request $request) {
        \Illuminate\Support\Facades\Log::info('Booking webhook', $request->all());
        return response()->json(['received' => true]);
    });
});
