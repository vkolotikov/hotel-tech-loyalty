<?php

namespace App\Services\Crm;

use App\Support\SharedCache;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/** The public ECB reference feed contains units of each currency per euro. */
final class EuroReferenceRates
{
    public const URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

    /** @return array{date: string, rates: array<string, string>}|null */
    public function latest(): ?array
    {
        $cache = SharedCache::store();
        $last = $cache->get('crm:ecb:latest');
        // Only the first request in this interval refreshes the public feed, including after a failure.
        if ($cache->add('crm:ecb:refresh', true, now()->addMinutes(5))) {
            try {
                $response = Http::accept('application/xml')->connectTimeout(2)->timeout(3)->withoutRedirecting()->get(self::URL);
                if ($response->successful() && ($fresh = $this->parse($response->body()))) {
                    if (! $last || $fresh['date'] >= $last['date']) {
                        $last = $fresh;
                        $cache->put('crm:ecb:latest', $last, now()->addDays(8));
                    }
                    $cache->put('crm:ecb:refresh', true, now()->addHour());
                }
            } catch (ConnectionException) {
                // A recent published snapshot still values the pipeline during a short outage.
            }
        }

        return $last && $this->recent($last['date']) ? $last : null;
    }

    private function parse(string $body): ?array
    {
        if ($body === '' || strlen($body) > 100000 || stripos($body, '<!DOCTYPE') !== false) {
            return null;
        }
        $xml = @simplexml_load_string($body, options: LIBXML_NONET);
        $day = $xml !== false ? ($xml->xpath('//*[local-name()="Cube" and @time]')[0] ?? null) : null;
        $date = (string) ($day['time'] ?? '');
        if ($day === null || ! $this->recent($date)) {
            return null;
        }
        $rates = ['EUR' => '1'];
        foreach ($day->xpath('./*[local-name()="Cube"]') ?: [] as $row) {
            $currency = (string) $row['currency'];
            $rate = (string) $row['rate'];
            if ($currency !== 'EUR' && preg_match('/^[A-Z]{3}$/D', $currency) && preg_match('/^\d{1,9}(?:\.\d{1,12})?$/D', $rate) && (float) $rate > 0) {
                $rates[$currency] = $rate;
            }
        }

        return count($rates) > 1 ? ['date' => $date, 'rates' => $rates] : null;
    }

    private function recent(string $date): bool
    {
        $today = now('Europe/Berlin');
        return preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) === 1 && $date <= $today->toDateString()
            && $date >= $today->subDays(7)->toDateString();
    }
}
