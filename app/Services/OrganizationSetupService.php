<?php

namespace App\Services;

use App\Models\BenefitDefinition;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatWidgetConfig;
use App\Models\CrmSetting;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class OrganizationSetupService
{
    public function __construct(
        protected IndustryPresetService $crmPreset,
        protected PlannerPresetService $plannerPreset,
    ) {}

    /**
     * Map of toggleable left-sidebar group label → list of feature
     * keys the wizard ticks for that group. Inverted at the end of
     * onboardWithIndustry() to compute hidden_nav_groups (every
     * group whose features key is NOT in the user's selection).
     *
     * Overview + System are intentionally not toggleable — see
     * MenuSettings.tsx.
     */
    private const FEATURE_TO_GROUP = [
        'ai_chat'    => 'AI Chat',
        'loyalty'    => 'Members & Loyalty',
        'bookings'   => 'Bookings',
        'crm'        => 'CRM & Marketing',
        'operations' => 'Operations',
    ];

    /**
     * One-shot onboarding orchestrator. Takes the wizard payload and
     * preconfigures every product the user said they want, applies
     * an industry preset to both CRM and Planner, hides the menu
     * groups they unchecked, and seeds basic property + chatbot
     * defaults so the dashboard is immediately useful.
     *
     * Idempotent: re-running with the same payload produces the same
     * end state — both preset services skip-existing for their
     * starter content and updateOrCreate is used for settings.
     *
     * @param Organization $org    The org to configure (current_organization_id is bound).
     * @param array        $data   Validated payload from SetupController::initialize.
     * @return array{steps:array<string,bool>,errors:array<int,string>}
     */
    public function onboardWithIndustry(Organization $org, array $data): array
    {
        app()->instance('current_organization_id', $org->id);

        $steps  = [];
        $errors = [];

        // 1. Org-level identity. The org name lands on every widget
        //    + email template + invoice. Phone/country are stored on
        //    Organization directly (already columns).
        $orgPatch = [];
        if (!empty($data['company_name'])) $orgPatch['name']    = $data['company_name'];
        if (!empty($data['phone']))        $orgPatch['phone']   = $data['phone'];
        if (!empty($data['country']))      $orgPatch['country'] = $data['country'];
        if ($orgPatch) { $org->update($orgPatch); }
        $steps['org_info'] = true;

        // 2. Industry presets — apply both the CRM (pipeline /
        //    stages / lost reasons / form / custom fields) and the
        //    Planner (groups + starter templates) preset for the
        //    chosen vertical. Both services are atomic and idempotent.
        $industry = $data['industry'] ?? 'hotel';
        try {
            $this->crmPreset->apply($industry);
            $steps['crm_preset'] = true;
        } catch (\Throwable $e) {
            $errors[] = 'CRM preset: ' . $e->getMessage();
            $steps['crm_preset'] = false;
        }
        try {
            $this->plannerPreset->apply($industry);
            $steps['planner_preset'] = true;
        } catch (\Throwable $e) {
            $errors[] = 'Planner preset: ' . $e->getMessage();
            $steps['planner_preset'] = false;
        }

        // 3. Menu visibility — compute the inverse of the feature
        //    selection. The user picked which features they want;
        //    we store which menu groups to hide so MenuSettings.tsx
        //    and Layout.tsx pick it up immediately.
        $selectedFeatures = is_array($data['features'] ?? null) ? $data['features'] : array_keys(self::FEATURE_TO_GROUP);
        $hidden = [];
        foreach (self::FEATURE_TO_GROUP as $key => $groupLabel) {
            if (!in_array($key, $selectedFeatures, true)) {
                $hidden[] = $groupLabel;
            }
        }
        CrmSetting::updateOrCreate(
            ['key' => 'hidden_nav_groups'],
            ['value' => json_encode($hidden)],
        );
        $steps['nav_visibility'] = true;

        // 4. Default tiers + benefits + hotel settings, even when
        //    loyalty isn't in the selected features — it's cheap and
        //    means the user can enable Members & Loyalty later from
        //    Settings → Menu without re-running setup.
        try {
            $this->setupDefaults($org);
            $steps['defaults'] = true;
        } catch (\Throwable $e) {
            $errors[] = 'Defaults: ' . $e->getMessage();
            $steps['defaults'] = false;
        }

        // 5. Property records. The first property is created by
        //    setupDefaults() above; if the user said they have N
        //    locations, top up to N total. Each gets a numbered
        //    suffix on both the name and the globally-unique code.
        $count = max(1, (int) ($data['property_count'] ?? 1));
        if ($count > 1) {
            $existing = Property::withoutGlobalScopes()
                ->where('organization_id', $org->id)
                ->count();
            if ($existing < $count) {
                $base = Str::upper(Str::substr($org->slug ?? 'HTL', 0, 5));
                for ($i = $existing + 1; $i <= $count; $i++) {
                    $code = $base . str_pad((string) $i, 2, '0', STR_PAD_LEFT);
                    while (Property::withoutGlobalScopes()->where('code', $code)->exists()) {
                        $code = $base . str_pad((string) (++$i), 2, '0', STR_PAD_LEFT);
                    }
                    Property::withoutGlobalScopes()->create([
                        'organization_id' => $org->id,
                        'code'            => $code,
                        'name'            => $org->name . ' Location ' . $i,
                        'city'            => '',
                        'country'         => $org->country ?? '',
                    ]);
                }
            }
            $steps['properties'] = true;
        }

        // 6. Chatbot — only customise if AI Chat is in the selected
        //    features. We seed the widget welcome message (what
        //    visitors see when the widget opens) and the assistant
        //    behavior identity (what the AI knows about itself).
        if (in_array('ai_chat', $selectedFeatures, true)) {
            try {
                $welcome = trim($data['welcome_message'] ?? '');
                if ($welcome !== '') {
                    $widget = ChatWidgetConfig::firstOrNew(['organization_id' => $org->id]);
                    // chat_widget_configs.widget_key + .api_key are NOT NULL
                    // — generate on first create (existing rows skip these).
                    if (!$widget->widget_key) $widget->widget_key = (string) Str::uuid();
                    if (!$widget->api_key)    $widget->api_key    = Str::random(48);
                    $widget->welcome_message = $welcome;
                    if (!$widget->company_name) $widget->company_name = $org->name;
                    if (!$widget->header_title) $widget->header_title = $org->name;
                    $widget->save();
                }

                // Seed an assistant identity from the industry + company
                // name so the first chat doesn't feel generic.
                $identity = $this->defaultIdentityFor($industry, $org->name);
                $behavior = ChatbotBehaviorConfig::firstOrNew(['organization_id' => $org->id]);
                if (!$behavior->identity)       $behavior->identity = $identity;
                if (!$behavior->assistant_name) $behavior->assistant_name = $org->name . ' Assistant';
                $behavior->is_active = true;
                $behavior->save();
                $steps['chatbot'] = true;
            } catch (\Throwable $e) {
                $errors[] = 'Chatbot: ' . $e->getMessage();
                $steps['chatbot'] = false;
            }
        }

        // 7. Optional sample data — kept opt-in because new users on
        //    a "real" account often don't want demo rows polluting
        //    their CRM. Wrapped in its own try so a failure here
        //    doesn't roll back the actual setup above.
        if (!empty($data['with_sample_data'])) {
            try {
                $this->seedSampleData($org);
                $steps['sample_data'] = true;
            } catch (\Throwable $e) {
                $errors[] = 'Sample data: ' . $e->getMessage();
                $steps['sample_data'] = false;
            }
        }

        // 8. Mark the wizard as completed so the Setup gate in
        //    App.tsx doesn't show it again. Stored alongside the
        //    industry choice for the "Currently:" badge in the
        //    settings UI.
        CrmSetting::updateOrCreate(
            ['key' => 'onboarding_completed_at'],
            ['value' => json_encode(now()->toIso8601String())],
        );

        return ['steps' => $steps, 'errors' => $errors];
    }

    /**
     * Short, industry-flavored identity blurb for the AI assistant.
     * Plugged into ChatbotBehaviorConfig.identity so the first chat
     * already sounds appropriate to the vertical. Admins can rewrite
     * it any time from Settings → AI Chat.
     */
    private function defaultIdentityFor(string $industry, string $orgName): string
    {
        return match ($industry) {
            'beauty'      => "You are the AI assistant for {$orgName}, a beauty & spa salon. Help visitors with treatment info, pricing, and booking. Friendly, warm tone.",
            'medical'     => "You are the AI assistant for {$orgName}, a medical practice. Help visitors with appointment info, services, and intake. Professional, reassuring tone. Never provide medical diagnoses.",
            'legal'       => "You are the AI assistant for {$orgName}, a law firm. Help visitors understand services and request consultations. Professional tone. Never provide legal advice.",
            'real_estate' => "You are the AI assistant for {$orgName}, a real-estate office. Help visitors with listings, viewings, and agent contact. Knowledgeable, responsive tone.",
            'education'   => "You are the AI assistant for {$orgName}, an education provider. Help visitors with course info, schedules, and enrolment. Encouraging, clear tone.",
            'fitness'     => "You are the AI assistant for {$orgName}, a fitness studio. Help visitors with classes, memberships, and trial bookings. Energetic, motivating tone.",
            'restaurant'  => "You are the AI assistant for {$orgName}, a restaurant. Help visitors with reservations, menu, and special events. Hospitable, food-loving tone.",
            default       => "You are the AI assistant for {$orgName}. Help visitors with bookings, info, and inquiries. Professional, welcoming tone.",
        };
    }

    /**
     * Set up a new organization with default tiers and settings.
     * Idempotent — safe to call multiple times (uses firstOrCreate).
     */
    public function setupDefaults(Organization $org): void
    {
        // Bind org context for BelongsToOrganization trait
        app()->instance('current_organization_id', $org->id);

        // Create default property — properties.code is GLOBALLY unique
        // (not scoped to org), so two orgs with similar slugs would collide.
        // Skip if this org already has any property; otherwise pick a code
        // with a numeric suffix that isn't already taken.
        $existing = Property::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->exists();
        if (!$existing) {
            $base = Str::upper(Str::substr($org->slug ?? 'HTL', 0, 5));
            $code = $base . '01';
            $suffix = 1;
            while (Property::withoutGlobalScopes()->where('code', $code)->exists()) {
                $suffix++;
                $code = $base . str_pad((string) $suffix, 2, '0', STR_PAD_LEFT);
            }
            Property::withoutGlobalScopes()->create([
                'organization_id' => $org->id,
                'code'            => $code,
                'name'            => $org->name . ' Main',
                'city'            => '',
                'country'         => $org->country ?? '',
            ]);
        }

        // Create default tiers — column is "earn_rate" not "earn_multiplier"
        $tiers = [
            ['name' => 'Bronze',   'min_points' => 0,     'earn_rate' => 1.0,  'color_hex' => '#CD7F32', 'sort_order' => 1],
            ['name' => 'Silver',   'min_points' => 1000,  'earn_rate' => 1.25, 'color_hex' => '#C0C0C0', 'sort_order' => 2],
            ['name' => 'Gold',     'min_points' => 5000,  'earn_rate' => 1.5,  'color_hex' => '#FFD700', 'sort_order' => 3],
            ['name' => 'Platinum', 'min_points' => 15000, 'earn_rate' => 2.0,  'color_hex' => '#E5E4E2', 'sort_order' => 4],
            ['name' => 'Diamond',  'min_points' => 50000, 'earn_rate' => 3.0,  'color_hex' => '#B9F2FF', 'sort_order' => 5],
        ];

        foreach ($tiers as $tier) {
            LoyaltyTier::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'name' => $tier['name']],
                array_merge($tier, ['is_active' => true])
            );
        }

        // Create default benefits — code is NOT NULL
        $benefits = [
            ['name' => 'Welcome Drink',   'code' => 'welcome_drink',    'description' => 'Complimentary welcome drink on arrival', 'category' => 'food_beverage', 'sort_order' => 1],
            ['name' => 'Late Checkout',    'code' => 'late_checkout',    'description' => 'Late checkout until 2pm',               'category' => 'room',           'sort_order' => 2],
            ['name' => 'Room Upgrade',     'code' => 'room_upgrade',     'description' => 'Complimentary room upgrade (subject to availability)', 'category' => 'room', 'sort_order' => 3],
            ['name' => 'Spa Discount',     'code' => 'spa_discount',     'description' => '15% discount on all spa treatments',   'category' => 'spa',            'sort_order' => 4],
            ['name' => 'Early Check-in',   'code' => 'early_checkin',    'description' => 'Early check-in from 11am',              'category' => 'room',           'sort_order' => 5],
            ['name' => 'Airport Transfer', 'code' => 'airport_transfer', 'description' => 'Complimentary airport transfer',        'category' => 'transport',      'sort_order' => 6],
        ];

        foreach ($benefits as $b) {
            BenefitDefinition::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'code' => $b['code']],
                array_merge($b, ['is_active' => true])
            );
        }

        // Default settings — type, group, label are NOT NULL
        $defaults = [
            ['key' => 'hotel_name',            'value' => $org->name, 'type' => 'text',   'group' => 'general',    'label' => 'Hotel Name'],
            ['key' => 'welcome_bonus_points',  'value' => '500',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Welcome Bonus Points'],
            ['key' => 'referrer_bonus_points', 'value' => '250',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Referrer Bonus Points'],
            ['key' => 'referee_bonus_points',  'value' => '250',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Referee Bonus Points'],
            ['key' => 'birthday_bonus_points', 'value' => '500',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Birthday Bonus Points'],
            ['key' => 'points_expiry_months',  'value' => '24',       'type' => 'number', 'group' => 'loyalty',    'label' => 'Points Expiry (Months)'],
            ['key' => 'points_per_currency',   'value' => '10',       'type' => 'number', 'group' => 'loyalty',    'label' => 'Points per Currency Unit'],
            ['key' => 'currency_symbol',       'value' => '€',        'type' => 'text',   'group' => 'general',    'label' => 'Currency Symbol'],
            // Appearance (brand colors) — needed for theme endpoint + branding UI
            ['key' => 'primary_color',        'value' => '#c9a84c', 'type' => 'string', 'group' => 'appearance', 'label' => 'Primary Color'],
            ['key' => 'secondary_color',      'value' => '#1e1e1e', 'type' => 'string', 'group' => 'appearance', 'label' => 'Secondary Color'],
            ['key' => 'accent_color',         'value' => '#32d74b', 'type' => 'string', 'group' => 'appearance', 'label' => 'Accent / Success'],
            ['key' => 'background_color',     'value' => '#0d0d0d', 'type' => 'string', 'group' => 'appearance', 'label' => 'Background'],
            ['key' => 'surface_color',        'value' => '#161616', 'type' => 'string', 'group' => 'appearance', 'label' => 'Surface / Card'],
            ['key' => 'text_color',           'value' => '#ffffff', 'type' => 'string', 'group' => 'appearance', 'label' => 'Text Color'],
            ['key' => 'text_secondary_color', 'value' => '#8e8e93', 'type' => 'string', 'group' => 'appearance', 'label' => 'Secondary Text'],
            ['key' => 'border_color',         'value' => '#2c2c2c', 'type' => 'string', 'group' => 'appearance', 'label' => 'Border Color'],
            ['key' => 'error_color',          'value' => '#ff375f', 'type' => 'string', 'group' => 'appearance', 'label' => 'Error / Danger'],
            ['key' => 'warning_color',        'value' => '#ffd60a', 'type' => 'string', 'group' => 'appearance', 'label' => 'Warning'],
            ['key' => 'info_color',           'value' => '#0a84ff', 'type' => 'string', 'group' => 'appearance', 'label' => 'Info'],
            ['key' => 'dark_mode_enabled',    'value' => 'true',    'type' => 'boolean','group' => 'appearance', 'label' => 'Dark Mode'],
        ];

        foreach ($defaults as $setting) {
            HotelSetting::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'key' => $setting['key']],
                $setting
            );
        }

        // Default basic rating form — gives every org a working review
        // URL out of the box; custom forms can be added later in admin.
        ReviewForm::withoutGlobalScopes()->firstOrCreate(
            ['organization_id' => $org->id, 'is_default' => true],
            [
                'name'       => 'Stay Feedback',
                'type'       => 'basic',
                'is_active'  => true,
                'embed_key'  => Str::random(32),
                'config'     => [
                    'intro_text'         => 'We hope you enjoyed your stay. Your feedback helps us improve.',
                    'thank_you_text'     => 'Thank you for taking the time to share your experience.',
                    'ask_for_comment'    => true,
                    'allow_anonymous'    => true,
                    'redirect_threshold' => 4,
                    'redirect_prompt'    => 'Would you share this on a review site?',
                ],
            ]
        );
    }

    /**
     * Populate an organization with sample/demo data.
     *
     * Wrapped in a transaction so a partial failure rolls back cleanly —
     * the Setup wizard can safely retry or the user can re-run the step.
     */
    public function seedSampleData(Organization $org): void
    {
        app()->instance('current_organization_id', $org->id);

        // Make sure default tiers exist even if the caller skipped setupDefaults.
        $this->setupDefaults($org);

        $bronzeTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Bronze')->first();
        $silverTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Silver')->first();
        $goldTier   = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Gold')->first();

        if (!$bronzeTier) {
            Log::warning('seedSampleData: tiers missing after setupDefaults — aborting', ['org_id' => $org->id]);
            return;
        }

        DB::transaction(function () use ($org, $bronzeTier, $silverTier, $goldTier) {
            $this->seedSampleMembers($org, $bronzeTier, $silverTier, $goldTier);
            $this->seedSampleGuests($org);
            $this->seedSampleOffers($org);
        });
    }

    protected function seedSampleMembers(Organization $org, LoyaltyTier $bronze, LoyaltyTier $silver, LoyaltyTier $gold): void
    {
        $members = [
            ['name' => 'Alice Johnson',  'tier' => $gold,   'points' => 7500],
            ['name' => 'Bob Smith',      'tier' => $silver, 'points' => 2200],
            ['name' => 'Carol Davis',    'tier' => $bronze, 'points' => 450],
            ['name' => 'David Wilson',   'tier' => $silver, 'points' => 1800],
            ['name' => 'Emma Brown',     'tier' => $gold,   'points' => 6200],
        ];

        foreach ($members as $sm) {
            $slug = Str::slug(explode(' ', $sm['name'])[0]);
            $email = "{$slug}.{$org->id}@sample.hotel-tech.ai";

            $user = User::withoutGlobalScopes()->firstOrCreate(
                ['email' => $email],
                [
                    'name'            => $sm['name'],
                    'password'        => Hash::make('password'),
                    'user_type'       => 'member',
                    'organization_id' => $org->id,
                ]
            );

            LoyaltyMember::withoutGlobalScopes()->firstOrCreate(
                ['user_id' => $user->id],
                [
                    'organization_id' => $org->id,
                    'tier_id'         => $sm['tier']->id,
                    'member_number'   => 'M' . str_pad((string) random_int(10000, 999999), 6, '0', STR_PAD_LEFT),
                    'qr_code_token'   => Str::random(64),
                    'referral_code'   => strtoupper(Str::random(8)),
                    'current_points'  => $sm['points'],
                    'lifetime_points' => $sm['points'] + random_int(500, 3000),
                    'is_active'       => true,
                    'joined_at'       => now()->subDays(random_int(30, 365)),
                    'last_activity_at'=> now()->subDays(random_int(1, 14)),
                ]
            );
        }
    }

    protected function seedSampleGuests(Organization $org): void
    {
        // vip_level values must match the column default space ('Standard', 'silver', 'gold').
        // NEVER pass explicit null — the column is NOT NULL. Omit the key instead so the
        // PG default ('Standard') fires when we want the baseline.
        $guests = [
            ['first_name' => 'James',   'last_name' => 'Anderson', 'email' => "james.{$org->id}@sample.hotel-tech.ai",   'vip_level' => 'gold',     'total_stays' => 12, 'total_revenue' => 15000],
            ['first_name' => 'Sophie',  'last_name' => 'Martin',   'email' => "sophie.{$org->id}@sample.hotel-tech.ai",  'vip_level' => 'silver',   'total_stays' => 5,  'total_revenue' => 6500],
            ['first_name' => 'Michael', 'last_name' => 'Chen',     'email' => "michael.{$org->id}@sample.hotel-tech.ai", 'vip_level' => 'Standard', 'total_stays' => 2,  'total_revenue' => 1800],
        ];

        foreach ($guests as $sg) {
            Guest::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'email' => $sg['email']],
                array_filter(array_merge($sg, [
                    'full_name'      => $sg['first_name'] . ' ' . $sg['last_name'],
                    'guest_type'     => 'Individual',
                    'lead_source'    => 'Sample Data',
                    'last_stay_date' => now()->subDays(random_int(5, 90)),
                    'first_stay_date'=> now()->subDays(random_int(180, 730)),
                    'email_consent'  => true,
                ]), fn($v) => $v !== null)
            );
        }
    }

    protected function seedSampleOffers(Organization $org): void
    {
        if (!class_exists(\App\Models\SpecialOffer::class)) return;

        $offers = [
            [
                'title'       => 'Welcome Getaway',
                'description' => '20% off your first weekend stay as a new loyalty member.',
                'type'        => 'percentage',
                'value'       => 20,
                'is_active'   => true,
                'is_featured' => true,
                'start_date'  => now()->subDays(3),
                'end_date'    => now()->addDays(60),
            ],
            [
                'title'       => 'Spa Indulgence',
                'description' => 'Complimentary 30-min massage upgrade with any spa booking.',
                'type'        => 'complimentary',
                'is_active'   => true,
                'start_date'  => now()->subDays(1),
                'end_date'    => now()->addDays(90),
            ],
        ];

        foreach ($offers as $o) {
            try {
                \App\Models\SpecialOffer::withoutGlobalScopes()->firstOrCreate(
                    ['organization_id' => $org->id, 'title' => $o['title']],
                    array_filter($o, fn($v) => $v !== null)
                );
            } catch (\Throwable $e) {
                // Non-fatal — offers are a nice-to-have on sample data.
                Log::warning('seedSampleOffers: could not create offer', [
                    'org_id' => $org->id,
                    'title'  => $o['title'],
                    'error'  => $e->getMessage(),
                ]);
            }
        }
    }
}
