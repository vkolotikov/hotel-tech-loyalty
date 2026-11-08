<?php

namespace Tests\Unit\Support;

use App\Support\PlanModules;
use PHPUnit\Framework\TestCase;

/**
 * The modules sold on their own (owner 2026-11-02): which product lists and plan slugs stand for which modules and
 * packages (Lite, Standard, Pro), their prices (yearly 15 % less a month) and what they grant.
 */
class PlanModulesTest extends TestCase
{
    public function test_a_product_list_of_module_products_only_names_its_modules(): void
    {
        $cases = [
            [['loyalty'], ['loyalty']],
            [['content'], ['content']],
            [['content', 'loyalty'], ['loyalty', 'content']],
            [['appointments', 'booking'], ['appointments']],
            [['appointments'], ['appointments']],
            [['booking', 'loyalty', 'appointments'], ['appointments', 'loyalty']],
            // A full customer: any product outside the modules' own.
            [['crm', 'loyalty'], null],
            [['crm', 'loyalty', 'booking', 'chat'], null],
            [['appointments', 'crm'], null],
            [['content', 'chat'], null],
            // HexaTech CRM (2026-11-07) has its own product: the full suite's `crm` and `chat` never name it.
            [['crm_chat'], ['crm']],
            [['crm_chat', 'loyalty'], ['loyalty', 'crm']],
            [['crm_chat', 'crm'], null],
            [['crm_chat', 'chat'], null],
            // Names no module.
            [['booking'], null],
            [[], null],
        ];
        foreach ($cases as [$products, $modules]) {
            $this->assertSame($modules, PlanModules::fromProducts($products), json_encode($products));
        }
    }

    public function test_only_the_canonical_slug_of_a_choice_is_a_module_plan(): void
    {
        $this->assertSame(['loyalty' => 'standard'], PlanModules::selectionFromPlanSlug('loyalty'));
        $this->assertSame(['loyalty' => 'pro'], PlanModules::selectionFromPlanSlug('loyalty_pro'));
        $this->assertSame(['loyalty' => 'lite', 'content' => 'pro'], PlanModules::selectionFromPlanSlug('loyalty_lite-content_pro'));
        $this->assertSame(['appointments' => 'standard', 'loyalty' => 'standard', 'content' => 'standard'], PlanModules::selectionFromPlanSlug('appointments-loyalty-content'));
        $this->assertSame(['loyalty', 'content'], PlanModules::fromPlanSlug('loyalty-content_lite'));
        foreach (['content-loyalty', 'loyalty-loyalty_pro', 'loyalty_standard', 'loyalty_gold', 'appointments_gold', 'growth', 'starter', 'loyalty-pro', '', null] as $slug) {
            $this->assertNull(PlanModules::selectionFromPlanSlug($slug), (string) $slug);
        }

        $this->assertSame('loyalty-content', PlanModules::planSlug(['content', 'loyalty', 'content', 'nonsense']));
        $this->assertSame('loyalty_pro-content_lite', PlanModules::planSlug(['content' => 'lite', 'loyalty' => 'pro']));
        $this->assertSame('loyalty', PlanModules::planSlug(['loyalty' => 'gold']), 'an unknown package reads as Standard');
        $this->assertSame('appointments-content', PlanModules::planSlug(['content', 'appointments']));
        $this->assertSame('HexaTech Loyalty Pro + HexaTech Content', PlanModules::planName(['loyalty' => 'pro', 'content' => 'standard']));
        $this->assertSame(['lite', 'standard', 'pro'], PlanModules::tiers('loyalty'));
        $this->assertSame(['lite', 'standard', 'pro'], PlanModules::tiers('appointments'));
        $this->assertSame(['appointments' => 'pro'], PlanModules::selectionFromPlanSlug('appointments_pro'));
        $this->assertSame('appointments_lite-loyalty', PlanModules::planSlug(['loyalty' => 'standard', 'appointments' => 'lite']));

        // HexaTech CRM, the fourth module, comes last in every slug and its name keeps its capitals.
        $this->assertSame(['crm' => 'lite'], PlanModules::selectionFromPlanSlug('crm_lite'));
        $this->assertSame('loyalty_pro-crm', PlanModules::planSlug(['crm' => 'standard', 'loyalty' => 'pro']));
        $this->assertNull(PlanModules::selectionFromPlanSlug('crm-loyalty'), 'not in module order');
        $this->assertSame('HexaTech CRM Pro', PlanModules::planName(['crm' => 'pro']));
        $this->assertSame('HexaTech Content + HexaTech CRM', PlanModules::planName(['crm', 'content']));
        $this->assertSame(['crm_chat'], PlanModules::products(['crm']));
    }

    public function test_prices_by_package_and_yearly_fifteen_percent_less(): void
    {
        $this->assertSame(4900, PlanModules::fallbackMonthlyAmount(['loyalty' => 'lite']));
        $this->assertSame(8500, PlanModules::fallbackMonthlyAmount(['loyalty']));
        $this->assertSame(14900, PlanModules::fallbackMonthlyAmount(['loyalty' => 'pro']));
        $this->assertSame(3900, PlanModules::fallbackMonthlyAmount(['content' => 'lite']));
        $this->assertSame(17000, PlanModules::fallbackMonthlyAmount(['content', 'loyalty']));
        $this->assertSame(18800, PlanModules::fallbackMonthlyAmount(['loyalty' => 'pro', 'content' => 'lite']));
        $this->assertSame([4900, 8500, 14900], [PlanModules::fallbackMonthlyAmount(['appointments' => 'lite']), PlanModules::fallbackMonthlyAmount(['appointments']), PlanModules::fallbackMonthlyAmount(['appointments' => 'pro'])], 'Appointments at Loyalty\'s prices (owner 2026-11-04)');
        $this->assertSame(17000, PlanModules::fallbackMonthlyAmount(['appointments', 'loyalty']));
        $this->assertNull(PlanModules::fallbackMonthlyAmount([]));

        $this->assertSame(86700, PlanModules::yearlyAmount(8500), '85 € a month: 867 € a year, 72.25 € a month');
        $this->assertSame(49980, PlanModules::yearlyAmount(4900));
        $this->assertSame(151980, PlanModules::yearlyAmount(14900));
        $this->assertSame(15, PlanModules::YEARLY_DISCOUNT_PERCENT);
    }

    public function test_what_each_package_grants(): void
    {
        $lite = PlanModules::features(['loyalty' => 'lite']);
        $this->assertSame(['500', '2', 'false', 'false', 'false', 'email'], [$lite['max_loyalty_members'], $lite['max_team_members'], $lite['campaigns'], $lite['wallet'], $lite['push_notifications'], $lite['priority_support']]);

        $standard = PlanModules::features(['loyalty']);
        $this->assertSame(['2500', '5', 'true', 'true', 'true', 'true'], [$standard['max_loyalty_members'], $standard['max_team_members'], $standard['campaigns'], $standard['wallet'], $standard['push_notifications'], $standard['nfc_cards']]);
        $this->assertSame('false', $standard['landing_pages']);

        $pro = PlanModules::features(['loyalty' => 'pro']);
        $this->assertSame(['10000', '15', '3', 'priority'], [$pro['max_loyalty_members'], $pro['max_team_members'], $pro['max_properties'], $pro['priority_support']]);

        $this->assertSame('800', PlanModules::features(['content' => 'lite'])['ai_monthly_cost_cents']);
        $this->assertSame('2000', PlanModules::features(['content'])['ai_monthly_cost_cents']);
        $this->assertSame('5000', PlanModules::features(['content' => 'pro'])['ai_monthly_cost_cents']);
        $this->assertSame('false', PlanModules::features(['content'])['campaigns']);

        $this->assertSame(['2', '2', 'email'], array_map(fn ($k) => PlanModules::features(['appointments' => 'lite'])[$k], ['max_booking_staff', 'max_team_members', 'priority_support']));
        $this->assertSame(['5', '5', 'email'], array_map(fn ($k) => PlanModules::features(['appointments'])[$k], ['max_booking_staff', 'max_team_members', 'priority_support']));
        $this->assertSame(['15', '15', 'priority'], array_map(fn ($k) => PlanModules::features(['appointments' => 'pro'])[$k], ['max_booking_staff', 'max_team_members', 'priority_support']));
        $this->assertSame(['2', '2500', 'true'], array_map(fn ($k) => PlanModules::features(['appointments' => 'lite', 'loyalty' => 'standard'])[$k], ['max_booking_staff', 'max_loyalty_members', 'campaigns']));

        $crm = PlanModules::features(['crm' => 'lite']);
        $this->assertSame(['2', 'true', 'true', '1000', 'false', '0'], [$crm['max_team_members'], $crm['chatbot'], $crm['engagement'], $crm['ai_monthly_cost_cents'], $crm['campaigns'], $crm['max_loyalty_members']]);
        $this->assertSame(['5', '5000', '2500'], array_map(fn ($k) => PlanModules::features(['crm'])[$k], ['max_team_members', 'max_guests', 'ai_monthly_cost_cents']));
        $this->assertSame(['15', '20000', '6000', 'priority'], array_map(fn ($k) => PlanModules::features(['crm' => 'pro'])[$k], ['max_team_members', 'max_guests', 'ai_monthly_cost_cents', 'priority_support']));
        // One AI allowance per organisation: Content's and CRM's add up; a CRM package never adds Loyalty's campaigns.
        $this->assertSame('7500', PlanModules::features(['content' => 'pro', 'crm' => 'standard'])['ai_monthly_cost_cents']);
        $this->assertSame('false', PlanModules::features(['loyalty' => 'lite', 'crm' => 'pro'])['campaigns']);

        $both = PlanModules::features(['loyalty' => 'lite', 'content' => 'pro']);
        $this->assertSame(['500', '15', 'false', '5000', 'priority'], [$both['max_loyalty_members'], $both['max_team_members'], $both['campaigns'], $both['ai_monthly_cost_cents'], $both['priority_support']], 'the largest limit, any switch, the highest support');
    }

    public function test_the_modules_sold_alone_have_three_priced_packages(): void
    {
        foreach (PlanModules::SOLD_ALONE as $module) {
            $this->assertSame(PlanModules::TIERS, PlanModules::tiers($module));
            $amounts = array_map(fn (string $t) => PlanModules::fallbackMonthlyAmount([$module => $t]), PlanModules::TIERS);
            $this->assertSame($amounts, array_values(array_unique($amounts)));
            $sorted = $amounts;
            sort($sorted);
            $this->assertSame($sorted, $amounts, 'cheapest first');
            $this->assertSame(8500, PlanModules::fallbackMonthlyAmount([$module]), 'Standard is 85 €');
        }
    }
}
