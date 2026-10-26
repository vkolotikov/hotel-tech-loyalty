<?php

namespace App\Support\AdminAccess;

use Illuminate\Routing\Route;

/**
 * Who may call which staff endpoint, in one place (Part C spec §5). Every
 * /v1/admin route, and four staff routes outside it, run the `admin.access`
 * middleware, which asks here for the route's rule:
 *
 *   key => [read, change, product]
 *
 * - The key is the route's URI template without `api/v1/`, matched on whole
 *   segments. The longest matching key wins, so a sub-path can differ from
 *   its area.
 * - `read` applies to GET and HEAD, `change` to every other method. A rule is
 *   `staff` (any active staff member of the organisation), `manager`
 *   (`super_admin` or `manager`) or a capability column of `staff`
 *   (managers, and staff whose flag is set — as the menu shows those pages).
 * - `product` says what an organisation on the Appointments plan may reach:
 *   `appointments` and `account`. The others (`content`, `admin`, `booking`, `loyalty`,
 *   `crm`, `chat`) are recorded for the day the existing plans are enforced
 *   too; today they enforce nothing for them.
 *
 * Manager exactly where the menu's page is manager-only. Changes there are
 * manager-only; reads are manager-only only for sensitive data, because
 * other screens read the catalogues. A route no key matches is manager-only
 * (FALLBACK) and is recorded as `unmapped:<uri>`; AccessMapTest fails the
 * build first. Every new staff route needs a key here.
 */
final class AccessMap
{
    public const MANAGER_ROLES = ['super_admin', 'manager'];

    /** What an organisation on the Appointments plan may reach (spec §6.2). */
    public const PLAN_PRODUCTS = ['appointments', 'account'];

    public const PRODUCTS = ['appointments', 'content', 'account', 'admin', 'booking', 'loyalty', 'crm', 'chat'];

    /** @var array{0: string, 1: string, 2: string} */
    public const FALLBACK = ['manager', 'manager', 'admin'];

    /** @var array<string, array{0: string, 1: string, 2: string}> */
    public const MAP = [
        // ── The workspace (Setup keeps its own manager rule, SetupAccess)
        'admin/appointments'                    => ['staff',              'staff',              'appointments'],  // The workspace; Setup keeps its own manager rule (SetupAccess)
        'admin/content'                         => ['staff',              'staff',              'content'],       // HexaTech Content; brand, strategy and whole-calendar AI keep their own manager rule (ContentAccess)
        'admin/loyalty'                         => ['staff',              'staff',              'loyalty'],       // HexaTech Loyalty; award and redeem keep their capabilities (LoyaltyAccess)
        'admin/loyalty/members/{id}/history'    => ['staff',              'manager',            'loyalty'],       // A member's ledger; reversing a line is a manager's correction
        'admin/loyalty/program'                 => ['staff',              'manager',            'loyalty'],       // Tiers, benefits, boost events (the full admin's Program is manager-only)
        'admin/loyalty/program/boosts/confirm-times' => ['manager',       'manager',            'loyalty'],       // Release 6: "These times are right" for boosts flagged "check the time" (manager)
        'admin/loyalty/rewards'                 => ['staff',              'can_manage_offers',  'loyalty'],       // The rewards catalogue (changes: can_manage_offers, as admin/rewards)
        'admin/loyalty/offers'                  => ['staff',              'can_manage_offers',  'loyalty'],       // Offers (changes: can_manage_offers, as admin/offers)
        'admin/loyalty/redemptions'             => ['staff',              'can_redeem_points',  'loyalty'],       // Fulfil or cancel a redemption (can_redeem_points, as the full admin's routes)
        'admin/loyalty/members/{id}/tier'       => ['staff',              'manager',            'loyalty'],       // Release 2: a member's tier is a manager's correction
        'admin/loyalty/members/{id}/deactivate' => ['staff',              'manager',            'loyalty'],       // Deactivate a member (manager)
        'admin/loyalty/members/{id}/reactivate' => ['staff',              'manager',            'loyalty'],       // Reactivate a member (manager)
        'admin/loyalty/members/{id}/erase'      => ['staff',              'manager',            'loyalty'],       // Delete (anonymise) a member (manager)
        'admin/loyalty/members/duplicates'      => ['manager',            'manager',            'loyalty'],       // Likely duplicates: personal data side by side (manager)
        'admin/loyalty/members/merge'           => ['manager',            'manager',            'loyalty'],       // Merge two members (manager)
        'admin/loyalty/members/imports'         => ['manager',            'manager',            'loyalty'],       // Member import (manager)
        'admin/loyalty/members/export'          => ['manager',            'manager',            'loyalty'],       // Member export: personal data out of the system (manager)
        'admin/loyalty/insights'                => ['can_view_analytics', 'can_view_analytics', 'loyalty'],       // Insights: the full admin's Analytics rule
        'admin/loyalty/segments'                => ['staff',              'manager',            'loyalty'],       // Segments (changes: manager, beside the campaigns that use them)
        'admin/loyalty/campaigns'               => ['staff',              'manager',            'loyalty'],       // Email campaigns (changes and sending: manager, as admin/email-campaigns)
        'admin/loyalty/wallet'                  => ['manager',            'manager',            'loyalty'],       // Wallet pass settings and certificates (manager, as admin/wallet-config)
        'admin/loyalty/app-look'                => ['staff',              'manager',            'loyalty'],       // The member app's look (changes: manager, as admin/settings)
        'admin/loyalty/currency'                => ['manager',            'manager',            'loyalty'],       // The venue's currency in Card & app (release 4, R4-5; manager, as the appointments Setup)
        'admin/loyalty/push'                    => ['staff',              'manager',            'loyalty'],       // Push messages to a segment (release 3; changes and sending: manager)
        'admin/loyalty/sms'                     => ['staff',              'manager',            'loyalty'],       // SMS campaigns through the venue's Twilio (release 4; changes, tests and sending: manager)
        'admin/loyalty/members/{id}/cards'      => ['staff',              'staff',              'loyalty'],       // Release 5: a member's NFC cards (link, switch off: every staff member, as Edit details and admin/nfc-cards)
        'admin/loyalty/options'                 => ['staff',              'manager',            'loyalty'],       // Release 7: the programme's options and the setup wizard (changes: manager, as Program)
        'admin/loyalty/start'                   => ['staff',              'manager',            'loyalty'],       // Release 10: "Start here", the setup steps and which are done (reads only)
        'admin/loyalty/members/{id}/check-in'   => ['staff',              'can_award_points',   'loyalty'],       // Release 7: a check-in or a purchase at the desk (it writes points: can_award_points, as Award)
        'admin/loyalty/members/{id}/stamps'     => ['staff',              'staff',              'loyalty'],       // Release 7: a member's stamp card (read only)
        'admin/loyalty/members/{id}/credit'     => ['staff',              'can_redeem_points',  'loyalty'],       // Release 7: cashback credit; spending it at the desk is can_redeem_points, as Redeem
        'admin/loyalty/members/{id}/credit/adjust' => ['manager',         'manager',            'loyalty'],       // Release 7: a manager's correction of a member's credit
        'admin/loyalty/places'                  => ['staff',              'manager',            'loyalty'],       // Release 8: places and who may enter them (changes: manager, as Program); entries read by every staff member
        'admin/loyalty/members/{id}/validity'   => ['manager',            'manager',            'loyalty'],       // Release 8: a membership's end date (manager, as a tier change)
        'admin/loyalty/events'                  => ['staff',              'can_manage_offers',  'loyalty'],       // Release 8: events (changes: can_manage_offers, as offers)
        'admin/loyalty/events/{id}/sign-ups'    => ['staff',              'staff',              'loyalty'],       // Release 8: signing a member up for an event, or cancelling (every staff member, at the desk)
        'admin/loyalty/events/{id}/check-in'    => ['staff',              'staff',              'loyalty'],       // Release 8: checking a member in at an event (every staff member; the points are the event's)

        // ── The caller's own account
        'admin/branding'                        => ['staff',              'manager',            'account'],       // The theme every page reads, the workspace included (ruling R1)
        'admin/me'                              => ['staff',              'staff',              'account'],       // The caller's own profile
        'admin/push-token'                      => ['staff',              'staff',              'account'],       // The caller's own device

        // ── The full admin: everyday pages, settings and sensitive data
        'admin/ai-usage'                        => ['manager',            'manager',            'admin'],         // AI usage and cost (Settings, manager)
        'admin/analytics'                       => ['can_view_analytics', 'can_view_analytics', 'admin'],         // Analytics (menu: can_view_analytics; the routes check it too)
        'admin/api-tokens'                      => ['manager',            'manager',            'admin'],         // API tokens (Settings, manager)
        'admin/audit-logs'                      => ['manager',            'manager',            'admin'],         // Audit log (menu: manager)
        'admin/brands'                          => ['staff',              'manager',            'admin'],         // Brands (menu: manager); the brand switcher reads them
        'admin/business-reporting-key'          => ['can_view_analytics', 'can_view_analytics', 'admin'],         // Reporting key (the route checks can_view_analytics)
        'admin/dashboard'                       => ['staff',              'staff',              'admin'],         // Dashboard (menu: everyone)
        'admin/diag'                            => ['manager',            'manager',            'admin'],         // Operator diagnostics (route already needs super_admin)
        'admin/documentation'                   => ['staff',              'staff',              'admin'],         // Help pages
        'admin/industry-presets'                => ['staff',              'manager',            'admin'],         // Industry presets (Pipelines admin)
        'admin/integrations'                    => ['manager',            'manager',            'admin'],         // Integrations and their secrets (Settings, manager)
        'admin/landing-pages'                   => ['staff',              'manager',            'admin'],         // Landing page (menu: manager)
        'admin/planner'                         => ['staff',              'staff',              'admin'],         // Planner (menu: everyone)
        'admin/planner-presets'                 => ['staff',              'manager',            'admin'],         // Planner presets (Settings, manager)
        'admin/realtime'                        => ['staff',              'staff',              'admin'],         // The full admin's live poll
        'admin/reporting'                       => ['can_view_analytics', 'can_view_analytics', 'admin'],         // Reports (menu: can_view_analytics; the routes do not check it today)
        'admin/reviews'                         => ['staff',              'manager',            'admin'],         // Reviews (menu: manager); asking for a review is overridden below
        'admin/search'                          => ['staff',              'staff',              'admin'],         // Global search
        'admin/settings'                        => ['staff',              'manager',            'admin'],         // Settings (menu: manager); screens read display settings, secrets are masked
        'admin/setup'                           => ['staff',              'staff',              'admin'],         // First-run wizard: shown to any staff member until it is done
        'admin/team'                            => ['staff',              'manager',            'admin'],         // Team (Settings, manager); the Planner lists team members for everyone

        // ── Bookings, rooms and services
        'admin/booking-extras'                  => ['staff',              'manager',            'booking'],       // Room extras (menu: manager)
        'admin/booking-rooms'                   => ['staff',              'manager',            'booking'],       // Rooms (menu: manager); booking screens read them
        'admin/bookings'                        => ['staff',              'staff',              'booking'],       // Room bookings (menu: everyone); submissions overridden below
        'admin/properties'                      => ['staff',              'manager',            'booking'],       // Properties (menu: manager)
        'admin/reservations'                    => ['staff',              'staff',              'booking'],       // Reservations
        'admin/service-bookings'                => ['staff',              'staff',              'booking'],       // Service bookings (menu: everyone)
        'admin/service-categories'              => ['staff',              'manager',            'booking'],       // Service categories (Services page)
        'admin/service-extras'                  => ['staff',              'manager',            'booking'],       // Service extras (menu: manager)
        'admin/service-masters'                 => ['staff',              'manager',            'booking'],       // Team members who perform services (menu: manager)
        'admin/services'                        => ['staff',              'manager',            'booking'],       // Services (menu: manager); booking forms read them
        'admin/venues'                          => ['staff',              'manager',            'booking'],       // Venues (menu: manager)

        // ── Loyalty
        'admin/benefits'                        => ['staff',              'manager',            'loyalty'],       // Benefits (Program, manager)
        'admin/campaigns'                       => ['staff',              'manager',            'loyalty'],       // Campaigns (menu: manager)
        'admin/discounts'                       => ['staff',              'staff',              'loyalty'],       // Member discounts at the desk: routes already need can_redeem_points
        'admin/earn-rate-events'                => ['staff',              'manager',            'loyalty'],       // Earn-rate events (Program, manager)
        'admin/entitlements'                    => ['staff',              'staff',              'loyalty'],       // Members' benefit entitlements, used at the desk
        'admin/loyalty-presets'                 => ['staff',              'staff',              'loyalty'],       // Members onboarding wizard: shown to every staff member on Members
        'admin/member-portal'                   => ['staff',              'staff',              'loyalty'],       // Member portal tab of Members (read only)
        'admin/members'                         => ['staff',              'staff',              'loyalty'],       // Members (menu: everyone); points routes keep their capabilities
        'admin/nfc'                             => ['staff',              'staff',              'loyalty'],       // NFC
        'admin/nfc-cards'                       => ['staff',              'staff',              'loyalty'],       // NFC cards
        'admin/notifications'                   => ['staff',              'manager',            'loyalty'],       // Sends a push campaign (Campaigns, manager)
        'admin/offers'                          => ['staff',              'can_manage_offers',  'loyalty'],       // Offers (changes: the routes check can_manage_offers)
        'admin/points'                          => ['staff',              'staff',              'loyalty'],       // Points: the controller checks can_award_points / can_redeem_points
        'admin/referrals'                       => ['staff',              'staff',              'loyalty'],       // Referrals
        'admin/rewards'                         => ['staff',              'can_manage_offers',  'loyalty'],       // Rewards (changes: the routes check can_manage_offers)
        'admin/scan'                            => ['staff',              'staff',              'loyalty'],       // Scan (menu: everyone)
        'admin/segments'                        => ['staff',              'staff',              'loyalty'],       // Segments tab of Members (menu: everyone)
        'admin/tier-benefits'                   => ['staff',              'manager',            'loyalty'],       // Tier benefits (Program, manager)
        'admin/tiers'                           => ['staff',              'manager',            'loyalty'],       // Tiers (Program, manager)
        'admin/wallet-config'                   => ['manager',            'manager',            'loyalty'],       // Wallet passes and certificates (menu: manager)

        // ── CRM
        'admin/corporate-accounts'              => ['staff',              'staff',              'crm'],           // Corporate accounts
        'admin/crm-ai'                          => ['staff',              'staff',              'crm'],           // CRM AI helpers
        'admin/crm-settings'                    => ['staff',              'staff',              'crm'],           // Everyone saves column choices on Leads and Deals here
        'admin/custom-fields'                   => ['staff',              'manager',            'crm'],           // Custom fields (Pipelines admin)
        'admin/deals'                           => ['staff',              'staff',              'crm'],           // Deals (menu: everyone)
        'admin/email-campaigns'                 => ['staff',              'manager',            'crm'],           // Email campaigns (Marketing, manager)
        'admin/email-templates'                 => ['staff',              'manager',            'crm'],           // Email templates (Marketing, manager); sending one is overridden below
        'admin/guests'                          => ['staff',              'staff',              'crm'],           // Guests and clients
        'admin/inquiries'                       => ['staff',              'staff',              'crm'],           // Leads (menu: everyone)
        'admin/inquiry-lost-reasons'            => ['staff',              'manager',            'crm'],           // Lost reasons (Pipelines admin)
        'admin/inquiry-lost-reasons-admin'      => ['manager',            'manager',            'crm'],           // Lost reasons admin list (Pipelines admin)
        'admin/lead-forms'                      => ['staff',              'staff',              'crm'],           // Lead forms tab of Leads (menu: everyone)
        'admin/pipeline-stages'                 => ['staff',              'manager',            'crm'],           // Pipeline stages (Pipelines admin)
        'admin/pipelines'                       => ['staff',              'manager',            'crm'],           // Pipelines (Pipelines admin)
        'admin/saved-views'                     => ['staff',              'staff',              'crm'],           // A person's saved views
        'admin/tasks'                           => ['staff',              'staff',              'crm'],           // Tasks
        'admin/visitors'                        => ['staff',              'staff',              'crm'],           // Visitors

        // ── Chat and the chatbot
        'admin/chat-inbox'                      => ['staff',              'staff',              'chat'],          // Chat inbox
        'admin/chat-inbox-agents'               => ['staff',              'staff',              'chat'],          // Chat agents
        'admin/chat-inbox-canned'               => ['staff',              'manager',            'chat'],          // Canned replies
        'admin/chatbot'                         => ['staff',              'staff',              'chat'],          // Chatbot analytics (read only)
        'admin/chatbot-config'                  => ['staff',              'manager',            'chat'],          // Chatbot setup (menu: manager)
        'admin/chatbot-onboarding'              => ['manager',            'manager',            'chat'],          // Chatbot onboarding (Chatbot setup, manager)
        'admin/engagement'                      => ['staff',              'staff',              'chat'],          // Engagement (menu: everyone)
        'admin/knowledge'                       => ['staff',              'manager',            'chat'],          // Chatbot knowledge
        'admin/popup-rules'                     => ['staff',              'manager',            'chat'],          // Pop-up rules
        'admin/training'                        => ['staff',              'manager',            'chat'],          // Chatbot training
        'admin/voice-agent'                     => ['staff',              'manager',            'chat'],          // Voice agent
        'admin/widget-config'                   => ['staff',              'manager',            'chat'],          // Widget config

        // ── Sub-paths that differ from their area (the longest key wins)
        'admin/bookings/submissions'            => ['manager',            'manager',            'booking'],       // Website booking submissions (menu: manager)
        'admin/email-templates/{template}/send' => ['staff',              'staff',              'crm'],           // "Send template" on member and lead pages (pages for everyone)
        'admin/reviews/invitations'             => ['staff',              'staff',              'admin'],         // "Ask for a review" on booking, guest and member pages (pages for everyone)

        // ── Staff routes outside /admin
        'auth/billing'                          => ['manager',            'manager',            'admin'],         // Checkout, activation, Stripe portal, refresh, trial (Billing, manager)
        'auth/apply-industry'                   => ['manager',            'manager',            'admin'],         // Changes the organisation's industry and presets (Settings, manager)
        'integrations/leads'                    => ['staff',              'staff',              'crm'],           // Leads sent with an API token
        'mcp'                                   => ['staff',              'staff',              'admin'],         // The ChatGPT / Claude connector; its tools keep their own checks
    ];

    /** The route's URI template without `api/v1/` (`admin/services/{service}`, `mcp`). */
    public static function uriOf(Route $route): string
    {
        return (string) preg_replace('#^api/v1/#', '', $route->uri());
    }

    /** The longest key whose segments begin the route's template, or null. */
    public static function keyFor(Route $route): ?string
    {
        $segments = explode('/', self::uriOf($route));
        $best = null;
        $bestLength = 0;
        foreach (array_keys(self::MAP) as $key) {
            $keySegments = explode('/', $key);
            $length = count($keySegments);
            if ($length > $bestLength && array_slice($segments, 0, $length) === $keySegments) {
                $best = $key;
                $bestLength = $length;
            }
        }

        return $best;
    }

    public static function ruleFor(Route $route): Rule
    {
        $key = self::keyFor($route);
        [$read, $change, $product] = $key === null ? self::FALLBACK : self::MAP[$key];

        return new Rule($key ?? 'unmapped:' . self::uriOf($route), $read, $change, $product);
    }
}
