<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Http;
use UnexpectedValueException;

/** Read the retail lists used by the four public FDS builders. Prices in V2 are minor units, classic feeds use major units. */
final class FdsBuilderCatalog
{
    public const HOST = 'https://builder.fds-cards.co.uk';

    public function read(): array
    {
        $metal = $this->feed('v2/config');
        $plastic = $this->feed('pricing/config');
        $dinner = $this->feed('dinner/config');
        $parker = $this->feed('parker/config');
        $this->check(is_bool($metal['enabled'] ?? null));

        return [
            ...($metal['enabled'] ? $this->metal($metal['pricing']) : []),
            ...$this->plastic($plastic),
            ...$this->dinner($dinner),
            ...$this->pens($parker),
        ];
    }

    private function feed(string $path): array
    {
        $data = Http::acceptJson()->connectTimeout(4)->timeout(10)->retry(2, 250)
            ->withoutRedirecting()->get(self::HOST.'/api/'.$path)->throw()->json();
        $this->check(is_array($data) && $data !== []);

        return $data;
    }

    private function metal(array $price): array
    {
        $this->check($price['currency'] === 'gbp');
        $rates = $price['currencies'];
        $this->check(($rates['gbp']['rate_ppm'] ?? null) === 1000000);
        $vat = $price['vat'];
        $tax = 'Physical prices exclude VAT. The builder applies '.($this->units($vat['bp']) / 100).'% for delivery to '.implode(', ', $vat['countries']).'.';
        $out = [];
        foreach (['metal' => 'Metal business cards', 'nfc' => 'NFC metal business cards'] as $type => $name) {
            foreach (['standard', 'priority'] as $service) {
                $terms = $tax;
                if ($service === 'priority') {
                    $terms .= ' Confirm priority availability for the selected finish, quantity and destination in the builder.';
                }
                $lines = [];
                foreach ($price['anchors'][$type][$service] as [$quantity, $pence]) {
                    $minor = $this->units($pence);
                    $this->check($minor > 0 && is_int($quantity) && $quantity > 0 && ! isset($lines[$quantity]));
                    $amounts = [];
                    foreach ($rates as $iso => $rate) {
                        $ppm = $this->units($rate['rate_ppm']);
                        $this->check($ppm > 0);
                        $total = $iso === 'gbp' ? $minor : intdiv($minor * $ppm + 99999999, 100000000) * 100;
                        $amounts[] = $this->money($iso, $total / 100);
                    }
                    $lines[$quantity] = implode(' / ', $amounts);
                }
                $out['metal.'.$type.'.'.$service] = $this->cardTable($name.' · '.ucfirst($service), $lines, $terms, '/v2', [$type, $service]);
            }
        }
        $out['metal.packaging'] = $this->packaging($price['packaging'], 100, $tax, '/v2', 'Metal and NFC metal');
        $digital = $price['digital'];
        if ($digital['mode'] === 'subscription') {
            foreach ($digital['plans'] as $key => $plan) {
                $this->check(in_array($plan['interval'], ['month', 'year'], true));
                $amounts = [];
                foreach ($plan['gross_by_currency'] as $iso => $minor) {
                    if ($minor !== null) {
                        $amounts[] = $this->money($iso, $this->units($minor) / 100);
                    }
                }
                if ($amounts) {
                    $out['digital.'.$key] = $this->item('Digital business card profiles · '.$key,
                        'Recurring public price per profile per '.$plan['interval'].', including applicable VAT. '.implode(' / ', $amounts).'.', '/v2',
                        ['digital', 'profile', 'subscription', $key]);
                }
            }
        }

        return $out;
    }

    private function plastic(array $price): array
    {
        $rates = $price['currencies'];
        $this->check(($rates['gbp']['rate'] ?? null) == 1);
        $taxed = array_keys(array_filter($rates, fn ($rate) => $rate['vat'] === true));
        $tax = 'Plastic builder prices exclude VAT. The builder applies '.($this->amount($price['vat_rate']) * 100).'% for '.implode(', ', array_map('strtoupper', $taxed)).' orders.';
        $out = [];
        foreach (['plastic' => 'PVC plastic', 'plastic_eco' => 'Eco plastic', 'plastic_nfc' => 'NFC plastic'] as $type => $name) {
            $lines = [];
            foreach ($price['anchors'][$type] as $row) {
                $quantity = $row['qty'];
                $gbp = $this->amount($row['price']);
                $this->check(is_int($quantity) && $quantity > 0 && $gbp > 0 && ! isset($lines[$quantity]));
                $amounts = [];
                foreach ($rates as $iso => $rate) {
                    $factor = $this->amount($rate['rate']);
                    $this->check($factor > 0);
                    $amounts[] = $this->money($iso, $iso === 'gbp' ? $gbp : ceil($gbp * $factor));
                }
                $lines[$quantity] = implode(' / ', $amounts);
            }
            $out['classic.'.$type] = $this->cardTable($name.' business cards', $lines, $tax, '/plastic-cards', ['plastic', ...explode('_', $type)]);
        }
        $out['classic.packaging'] = $this->packaging($price['packaging_prices'], 1, $tax, '/plastic-cards', 'Plastic');

        return $out;
    }

    private function cardTable(string $title, array $lines, string $terms, string $path, array $keywords): array
    {
        $this->check($lines !== []);
        ksort($lines, SORT_NUMERIC);
        $body = 'Net total for the whole run at the listed quantity, before optional packaging or other extras. '.$terms
            .' Match product, quantity, service and currency exactly. Use the builder for another quantity. Access-control cards, custom chips and bespoke work need their own quote. An agreed customer quote takes precedence.';
        foreach ($lines as $quantity => $values) {
            $body .= "\n".$quantity.' cards — '.$values;
        }

        return $this->item($title, $body, $path, ['cards', 'price', ...$keywords]);
    }

    private function packaging(array $options, int $divisor, string $tax, string $path, string $product): array
    {
        $this->check(array_key_exists('none', $options));
        $lines = ['Packaging charge per card in GBP, added to the physical card order. '.$tax.' Use checkout for the converted packaging line.'];
        foreach ($options as $key => $price) {
            $lines[] = ucfirst($key).' — '.$this->money('gbp', $this->amount($price) / $divisor).' per card.';
        }

        return $this->item($product.' card packaging', implode("\n", $lines), $path, ['packaging', 'box', 'holder', strtolower($product)]);
    }

    private function dinner(array $config): array
    {
        $prices = $config['prices'];
        $lines = ['Personalised school lunch cards. Prices apply to this school card programme.'];
        foreach (['plastic' => 'Plastic lunch card, each', 'metal' => 'Metal lunch card, each', 'holder' => 'Optional holder, each', 'delivery_omniva' => 'Omniva delivery, per order'] as $key => $label) {
            $lines[] = $label.' — '.$this->money($config['currency'], $prices[$key]).'.';
        }

        return ['dinner' => $this->item('School lunch cards · pusdienu kartiņa', implode("\n", $lines), '/pusdienu-kartina', ['school', 'lunch', 'dinner', 'pusdienu', 'kartiņa'])];
    }

    private function pens(array $config): array
    {
        $iso = $config['currency'];
        $collections = [];
        foreach ($config['pens'] as $pen) {
            $this->check(is_bool($pen['available']) && is_string($pen['name']) && is_string($pen['collection']));
            if ($pen['available']) {
                $collections[$pen['collection']][] = $pen['name'].' — '.$this->money($iso, $pen['price']).' per pen.';
            }
        }
        $out = [];
        foreach ($collections as $collection => $lines) {
            $out['pens.'.$collection] = $this->item('Engraved pens · '.strtoupper($collection), implode("\n", $lines)
                ."\nOptional packaging, second-side engraving and delivery are separate.", '/parker', ['pen', 'parker', 'engraved', $collection]);
        }
        $extras = ['Second-side engraving — '.$this->money($iso, $config['back_engraving']).' per pen.'];
        $labels = ['case' => 'Standard Parker case', 'bag' => 'Gift bag', 'box2' => 'Parker box with pen pouch', 'box' => 'Gift box with notepad'];
        foreach ($config['packaging'] as $pack) {
            $extras[] = ($labels[$pack['key']] ?? $pack['key']).' — '.$this->money($iso, $pack['price']).' per pen.';
        }
        $extras[] = 'Omniva delivery to LV — '.$this->money($iso, $config['delivery_omniva']).' per order.';
        foreach ($config['shipping'] as $country => $shipping) {
            if ($shipping['enabled'] === true) {
                $extras[] = 'Omniva delivery to '.$country.' — '.$this->money($iso, $shipping['price']).' per order.';
            }
        }
        $out['pens.extras'] = $this->item('Engraved pen packaging, engraving and delivery', implode("\n", $extras), '/parker', ['pen', 'engraving', 'parker', 'packaging', 'delivery']);

        return $out;
    }

    private function item(string $title, string $body, string $path, array $keywords): array
    {
        return ['question' => 'FDS builder prices · '.$title, 'answer' => $body."\nPublic builder: ".self::HOST.$path,
            'keywords' => array_values(array_unique($keywords))];
    }

    private function units(mixed $value): int
    {
        $this->check(is_int($value) && $value >= 0);

        return $value;
    }

    private function amount(mixed $value): float
    {
        $this->check(is_numeric($value) && is_finite((float) $value) && $value >= 0);

        return (float) $value;
    }

    private function money(string $iso, mixed $amount): string
    {
        $this->check((bool) preg_match('/^[a-z]{3}$/iD', $iso));

        return strtoupper($iso).' '.number_format($this->amount($amount), 2, '.', '');
    }

    private function check(bool $valid): void
    {
        if (! $valid) {
            throw new UnexpectedValueException('Unexpected FDS public pricing configuration.');
        }
    }
}
