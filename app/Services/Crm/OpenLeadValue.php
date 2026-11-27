<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use App\Models\Organization;
use App\Services\Integrations\CrmMail;
use App\Services\Portal\PortalBootstrap;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Builder;

final class OpenLeadValue
{
    public function __construct(private EuroReferenceRates $exchange) {}

    /** The supplied query carries the same open status, tenant and brand restrictions as the lead list. */
    public function summary(Builder $open, Organization $org): array
    {
        $groups = (clone $open)->where('organization_id', $org->id)->whereNotNull('total_value')->where('total_value', '<>', 0)
            ->selectRaw('organization_id, brand_id, currency, count(*) as leads, sum(total_value) as amount')
            ->groupBy('organization_id', 'brand_id', 'currency')->toBase()->get();
        return $this->summaries([$groups], $org)[0];
    }

    /** Value many customer portfolios using the same currency rules and one rate snapshot. */
    public function summaries(array $sets, Organization $org): array
    {
        $venue = PortalBootstrap::currency($org);
        $brand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $fds = (int) $org->id === CrmMail::ORGANIZATION && ($brand === null || (int) $brand === CrmMail::BRAND);
        $reporting = $fds ? 'EUR' : $venue;
        $totals = $codes = [];
        foreach ($sets as $key => $groups) {
            $amounts = $counts = [];
            foreach ($groups as $row) {
                if ((int) $row->leads === 0) {
                    continue;
                }
                $code = Inquiry::currencyForValue($row->currency, true, (int) $row->organization_id, (int) $row->brand_id) ?? $venue;
                $amounts[$code] = ($amounts[$code] ?? BigDecimal::zero())->plus((string) $row->amount);
                $counts[$code] = ($counts[$code] ?? 0) + (int) $row->leads;
                $codes[$code] = true;
            }
            ksort($amounts);
            $totals[$key] = [$amounts, $counts];
        }
        $snapshot = array_diff(array_keys($codes), [$reporting, 'XXX']) ? $this->exchange->latest() : null;

        return array_map(fn ($pair) => $this->convert($pair[0], $pair[1], $reporting, $snapshot), $totals);
    }

    private function convert(array $amounts, array $counts, string $reporting, ?array $snapshot): array
    {
        $rates = $snapshot['rates'] ?? [];
        $total = BigDecimal::zero()->toBigRational();
        $included = $unrated = 0;
        $rows = [];
        foreach ($amounts as $code => $amount) {
            $rows[] = [
                'currency' => $code, 'amount' => $code === 'XXX' ? null : (string) $amount, 'count' => $counts[$code],
                'included' => $code !== 'XXX' && ($code === $reporting || isset($rates[$code], $rates[$reporting])),
            ];
            if ($code === 'XXX') {
                continue;
            }
            if ($code === $reporting) {
                $total = $total->plus($amount);
            } elseif (isset($rates[$code], $rates[$reporting])) {
                $total = $total->plus($amount->toBigRational()->multipliedBy($rates[$reporting])->dividedBy($rates[$code]));
            } else {
                $unrated += $counts[$code];
                continue;
            }
            $included += $counts[$code];
        }

        return [
            'currency' => $reporting, 'amount' => $included || ! $rows ? (string) $total->toScale(2, RoundingMode::HalfUp) : null,
            'rate_date' => $snapshot['date'] ?? null,
            'converted' => $included > ($counts[$reporting] ?? 0),
            'missing_currency' => $counts['XXX'] ?? 0, 'missing_rate' => $unrated, 'groups' => $rows,
        ];
    }
}
