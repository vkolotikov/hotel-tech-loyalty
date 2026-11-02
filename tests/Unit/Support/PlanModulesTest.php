<?php

namespace Tests\Unit\Support;

use App\Support\PlanModules;
use PHPUnit\Framework\TestCase;

/** The modules sold on their own (owner 2026-11-02): which product lists and plan slugs stand for which modules. */
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
            // Names no module.
            [['booking'], null],
            [[], null],
        ];
        foreach ($cases as [$products, $modules]) {
            $this->assertSame($modules, PlanModules::fromProducts($products), json_encode($products));
        }
    }

    public function test_only_the_canonical_slug_of_a_set_is_a_module_plan(): void
    {
        $this->assertSame(['loyalty'], PlanModules::fromPlanSlug('loyalty'));
        $this->assertSame(['loyalty', 'content'], PlanModules::fromPlanSlug('loyalty-content'));
        $this->assertSame(['appointments', 'loyalty', 'content'], PlanModules::fromPlanSlug('appointments-loyalty-content'));
        foreach (['content-loyalty', 'loyalty-loyalty', 'growth', 'starter', 'loyalty-pro', '', null] as $slug) {
            $this->assertNull(PlanModules::fromPlanSlug($slug), (string) $slug);
        }

        $this->assertSame('loyalty-content', PlanModules::planSlug(['content', 'loyalty', 'content', 'nonsense']));
        $this->assertSame('appointments-content', PlanModules::planSlug(['content', 'appointments']));
    }

    public function test_a_sets_products_prices_and_features(): void
    {
        $this->assertSame(['loyalty', 'content'], PlanModules::products(['content', 'loyalty']));
        $this->assertSame(['appointments', 'booking', 'loyalty'], PlanModules::products(['loyalty', 'appointments']));

        $this->assertSame(8500, PlanModules::fallbackMonthlyAmount(['loyalty']));
        $this->assertSame(17000, PlanModules::fallbackMonthlyAmount(['content', 'loyalty']));
        $this->assertNull(PlanModules::fallbackMonthlyAmount(['appointments', 'loyalty']), 'Appointments is priced in billing only');
        $this->assertNull(PlanModules::fallbackMonthlyAmount([]));

        $loyalty = PlanModules::features(['loyalty']);
        $this->assertSame('true', $loyalty['campaigns']);
        $this->assertSame('true', $loyalty['wallet']);
        $this->assertSame('false', $loyalty['landing_pages']);
        $this->assertSame('2000', $loyalty['max_loyalty_members']);

        $content = PlanModules::features(['content']);
        $this->assertSame('false', $content['campaigns']);
        $this->assertSame('0', $content['max_loyalty_members']);

        $both = PlanModules::features(['content', 'loyalty']);
        $this->assertSame('true', $both['campaigns'], 'a switch any module turns on');
        $this->assertSame('2000', $both['max_loyalty_members'], 'the largest limit');
    }

    public function test_the_modules_sold_alone_are_modules(): void
    {
        foreach (PlanModules::SOLD_ALONE as $module) {
            $this->assertTrue(PlanModules::exists($module));
            $this->assertNotNull(PlanModules::fallbackMonthlyAmount([$module]));
        }
    }
}
