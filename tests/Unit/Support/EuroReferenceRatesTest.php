<?php

namespace Tests\Unit\Support;

use App\Services\Crm\EuroReferenceRates;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EuroReferenceRatesTest extends TestCase
{
    public function test_a_recent_snapshot_survives_outages_and_an_old_or_invalid_feed_cannot_replace_it(): void
    {
        config(['cache.shared' => 'array']);
        $this->travelTo(Carbon::parse('2026-11-27 12:00:00 UTC'));
        $xml = '<gesmes:Envelope xmlns:gesmes="urn:gesmes" xmlns="urn:ecb"><Cube><Cube time="2026-11-26"><Cube currency="GBP" rate="0.83755"/></Cube></Cube></gesmes:Envelope>';
        Http::fake([EuroReferenceRates::URL => Http::sequence()->push($xml)->push('', 503)
            ->push(str_replace('2026-11-26', '2026-12-20', $xml))->push('<bad')->push($xml)]);
        $rates = app(EuroReferenceRates::class);
        $expected = ['date' => '2026-11-26', 'rates' => ['EUR' => '1', 'GBP' => '0.83755']];
        $this->assertSame($expected, $rates->latest());
        $this->assertSame($expected, $rates->latest());
        Http::assertSentCount(1);
        $this->travel(2)->hours();
        $this->assertSame($expected, $rates->latest());
        $this->travel(6)->minutes();
        $this->assertSame($expected, $rates->latest());
        $this->travel(6)->minutes();
        $this->assertSame($expected, $rates->latest());
        $this->travel(8)->days();
        $this->assertNull($rates->latest());
        Http::assertSentCount(5);
    }
}
