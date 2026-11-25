<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Brand;
use App\Models\KnowledgeItem;
use App\Models\Organization;
use App\Services\Integrations\FdsBuilderCatalog;
use App\Services\Integrations\FdsBuilderKnowledge;
use App\Services\KnowledgeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;
use UnexpectedValueException;

class FdsBuilderKnowledgeTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private array $feeds;
    private Brand $fds;
    private Brand $sibling;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildCrmWorkspaceTables();
        app()->instance('current_organization_id', FdsBuilderKnowledge::ORGANIZATION);
        if (! Schema::hasColumn('knowledge_items', 'source_key')) {
            (require database_path('migrations/2026_11_25_190000_add_source_to_knowledge_items.php'))->up();
        }
        $org = new Organization(['name' => 'Retail fixtures', 'slug' => 'fds-test']);
        $org->forceFill(['id' => FdsBuilderKnowledge::ORGANIZATION])->saveQuietly();
        $this->fds = $this->brand(FdsBuilderKnowledge::BRAND, 'kolotikovs-z4Qx');
        $this->sibling = $this->brand(80000023, 'other-retail-fixture');

        $fx = ['gbp' => ['rate_ppm' => 1000000], 'eur' => ['rate_ppm' => 1170000]];
        $classic = [['qty' => 100, 'price' => 250]];
        $this->feeds = [
            'v2/config' => ['enabled' => true, 'pricing' => [
                'currency' => 'gbp', 'currencies' => $fx, 'vat' => ['bp' => 2000, 'countries' => ['GB', 'IM']],
                'anchors' => ['metal' => ['standard' => [[1, 3900], [100, 24900]], 'priority' => [[100, 39900]]],
                    'nfc' => ['standard' => [[100, 59900]], 'priority' => [[100, 74900]]]],
                'packaging' => ['none' => 0, 'branded' => 700],
                'digital' => ['mode' => 'subscription', 'plans' => ['monthly' => ['interval' => 'month', 'gross_by_currency' => ['gbp' => 800, 'eur' => 900]]]],
            ]],
            'pricing/config' => ['anchors' => ['metal' => [['qty' => 100, 'price' => 550]], 'plastic' => $classic, 'plastic_eco' => $classic,
                'plastic_nfc' => [['qty' => 100, 'price' => 400]]], 'packaging_prices' => ['none' => 0, 'holder' => 5],
                'vat_rate' => 0.2, 'currencies' => ['gbp' => ['rate' => 1, 'vat' => true], 'eur' => ['rate' => 1.17, 'vat' => false]]],
            'dinner/config' => ['currency' => 'EUR', 'prices' => ['plastic' => 10, 'metal' => 60, 'holder' => 5, 'delivery_omniva' => 7]],
            'parker/config' => ['currency' => 'EUR', 'pens' => [
                ['name' => 'Parker Jotter XL', 'collection' => 'jotter', 'available' => true, 'price' => 49],
                ['name' => 'Retired pen', 'collection' => 'im', 'available' => false, 'price' => 140],
            ], 'shipping' => [], 'delivery_omniva' => 7, 'back_engraving' => 10, 'packaging' => [['key' => 'case', 'price' => 0]]],
        ];
        Http::preventStrayRequests();
        Http::fake([FdsBuilderCatalog::HOST.'/api/*' => function (Request $request) {
            $this->assertSame('GET', $request->method());
            return Http::response($this->feeds[substr($request->url(), strlen(FdsBuilderCatalog::HOST.'/api/'))]);
        }]);
    }

    private function brand(int $id, string $slug): Brand
    {
        $brand = new Brand(['organization_id' => FdsBuilderKnowledge::ORGANIZATION, 'name' => 'Retail brand', 'slug' => $slug]);
        $brand->forceFill(['id' => $id, 'widget_token' => str()->random(32)])->saveQuietly();

        return $brand;
    }

    private function sync(): array
    {
        return app(FdsBuilderKnowledge::class)->sync(app(FdsBuilderCatalog::class));
    }

    public function test_source_units_brand_isolation_and_both_knowledge_consumers(): void
    {
        $this->artisan('crm:sync-fds-builder-prices')->assertSuccessful();
        $rows = KnowledgeItem::withoutGlobalScopes()->whereNotNull('source_key')->get()->keyBy('source_key');
        $this->assertSame([$this->fds->id], $rows->pluck('brand_id')->unique()->values()->all());
        $this->assertSame([FdsBuilderKnowledge::ORGANIZATION], $rows->pluck('organization_id')->unique()->values()->all());
        $standard = $rows['fds-builder.metal.metal.standard']->answer;
        $this->assertStringContainsString('100 cards — GBP 249.00 / EUR 292.00', $standard);
        $this->assertStringContainsString('20% for delivery to GB, IM', $standard);
        $this->assertStringNotContainsString('550.00', $rows->pluck('answer')->implode(' '));
        $this->assertStringContainsString('GBP 400.00', $rows['fds-builder.classic.plastic_nfc']->answer);
        $this->assertStringContainsString('GBP 7.00 per card', $rows['fds-builder.metal.packaging']->answer);
        $this->assertStringContainsString('per profile per month, including applicable VAT. GBP 8.00', $rows['fds-builder.digital.monthly']->answer);
        $this->assertStringNotContainsString('Retired pen', $rows->pluck('answer')->implode(' '));
        $knowledge = app(KnowledgeService::class);
        $query = 'price for 100 standard metal business cards';
        $this->assertStringContainsString('GBP 249.00', json_encode($knowledge->forSales($query, $this->fds)));
        $this->assertStringContainsString('GBP 249.00', $knowledge->getKnowledgeContext($query, $this->fds->organization_id, $this->fds->id, false));
        $this->assertStringNotContainsString('FDS builder', json_encode($knowledge->forSales($query, $this->sibling)));
        $this->assertStringNotContainsString('FDS builder', $knowledge->getKnowledgeContext($query, $this->sibling->organization_id, $this->sibling->id, false));
        $this->assertSame([], $knowledge->captureSources($this->fds));
    }

    public function test_refresh_preserves_manual_answers_and_staff_switches_and_retires_withdrawn_offers(): void
    {
        $first = $this->sync();
        $this->assertGreaterThan(0, $first['changed']);
        $this->assertSame(0, $this->sync()['changed']);
        $item = KnowledgeItem::withoutGlobalScopes()->where('source_key', 'fds-builder.metal.metal.standard')->sole();
        $manual = KnowledgeItem::withoutGlobalScopes()->create(['organization_id' => $this->fds->organization_id, 'brand_id' => $this->fds->id,
            'question' => $item->question, 'answer' => 'Customer-approved manual policy.']);
        $item->update(['is_active' => false, 'use_count' => 11]);
        $this->feeds['v2/config']['pricing']['anchors']['metal']['standard'][1][1] = 25900;
        $this->feeds['parker/config']['pens'][0]['available'] = false;
        $this->feeds['v2/config']['pricing']['digital']['mode'] = 'enquiry';
        $this->assertEquals(['changed' => 1, 'entries' => $first['entries'] - 2, 'retired' => 2], $this->sync());
        $item->refresh();
        $this->assertFalse($item->is_active);
        $this->assertSame(11, $item->use_count);
        $this->assertStringContainsString('GBP 259.00', $item->answer);
        $this->assertSame('Customer-approved manual policy.', $manual->fresh()->answer);
    }

    public function test_invalid_feed_keeps_the_previous_complete_snapshot_until_expiry(): void
    {
        $this->sync();
        $this->travel(49)->hours();
        $this->feeds['v2/config']['pricing']['anchors']['metal']['standard'][1][1] = 25900;
        $this->feeds['dinner/config']['prices']['plastic'] = 'unavailable';
        try {
            $this->sync();
            $this->fail('Malformed list was accepted');
        } catch (UnexpectedValueException) {
            $this->assertDatabaseMissing('knowledge_items', ['answer' => 'unavailable']);
        }
        $old = KnowledgeItem::withoutGlobalScopes()->where('source_key', 'fds-builder.metal.metal.standard')->sole();
        $this->assertStringContainsString('GBP 249.00', $old->answer);
        $query = '100 standard metal business cards';
        $knowledge = app(KnowledgeService::class);
        $this->assertEmpty($knowledge->forSales($query, $this->fds)['answers']);
        $this->assertSame('', $knowledge->getKnowledgeContext($query, $this->fds->organization_id, $this->fds->id, false));
        $this->feeds['dinner/config']['prices']['plastic'] = 10;
        $this->sync();
        $this->assertStringContainsString('GBP 259.00', $knowledge->getKnowledgeContext($query, $this->fds->organization_id, $this->fds->id, false));
    }

    public function test_a_different_brand_in_the_same_slot_makes_no_network_request(): void
    {
        $this->fds->updateQuietly(['slug' => 'another-brand']);
        $this->artisan('crm:sync-fds-builder-prices')->expectsOutput('FDS Cards brand absent. Skipped.')->assertSuccessful();
        Http::assertNothingSent();
    }
}
