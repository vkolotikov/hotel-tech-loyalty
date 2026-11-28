<?php

namespace App\Services\Crm;

use Brick\Math\BigDecimal;

/** Check explicit monetary amounts in an email before exposing it to the composer. */
final class EmailPriceCheck
{
    private const CODES = 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VED VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG';

    private const SYMBOLS = ['€' => 'EUR', '£' => 'GBP', '₹' => 'INR', '₽' => 'RUB', '₩' => 'KRW', '₴' => 'UAH', '₺' => 'TRY', '₫' => 'VND', 'US$' => 'USD', 'CA$' => 'CAD', 'C$' => 'CAD', 'AU$' => 'AUD', 'A$' => 'AUD', 'NZ$' => 'NZD', 'R$' => 'BRL'];

    public static function currencyCodes(): array
    {
        return explode(' ', self::CODES);
    }

    public static function supported(string $text, array $context): bool
    {
        $quote = $context['project_evidence']['approved_quote'] ?? null;
        $currency = $quote['currency'] ?? $context['lead']['currency'] ?? '';
        $claims = self::amounts($text, $currency);
        $rates = self::commercialRates($text);
        $managerAmounts = $managerRates = [];
        foreach ($context['manager_guidance'] ?? [] as $guidance) {
            $clauses = preg_split('/\R|;|(?<=[.!?])\s+|,(?!\d)\s*|\s+\b(?:but|mais|pero|aber|но)\s+|\s+(?=(?:instead of|rather than|not|au lieu de|statt|en lugar de|вместо)\b)/iu', $guidance);
            foreach ($clauses as $clause) {
                // A later correction can withdraw an earlier manager figure. A buyer budget is never an offer.
                $approved = ! preg_match('/\b(?:budget|presupuesto|бюджет\pL*|expired|previous|old|not|do not|don.t|rejected|instead of|rather than|au lieu de|statt|en lugar de|вместо|не предлагать)\b/iu', $clause);
                foreach (self::amounts($clause, $currency) as $amount) {
                    $managerAmounts[$amount] = $approved;
                }
                foreach (self::commercialRates($clause) as $rate) {
                    $managerRates[$rate] = $approved;
                }
            }
        }
        $currentQuote = ($quote['status'] ?? null) === 'valid';
        if ($rates) {
            $verified = [];
            foreach ($context['brand_knowledge']['answers'] ?? [] as $row) {
                array_push($verified, ...self::commercialRates($row['answer'], $row['question'] ?? ''));
            }
            foreach ($context['brand_knowledge']['documents'] ?? [] as $row) {
                array_push($verified, ...self::commercialRates($row['excerpt'], $row['title'] ?? ''));
            }
            array_push($verified, ...self::commercialRates($context['project_evidence']['reviewed_brand_terms'] ?? ''));
            $quoteRates = $currentQuote ? self::commercialRates($quote['scope'] ?? '') : [];
            foreach ($rates as $rate) {
                $type = explode(' ', $rate)[0].' ';
                $agreed = array_filter($quoteRates, fn ($term) => str_starts_with($term, $type));
                if ($agreed && ! in_array($rate, $agreed, true)) {
                    return false;
                }
            }
            array_push($verified, ...$quoteRates, ...array_keys(array_filter($managerRates)));
            if (array_diff($rates, $verified)) {
                return false;
            }
        }
        $allowed = [];
        if ($currentQuote) {
            $taxIncluded = '/\b(tax included|including (?:tax|vat)|vat[- ]inclusive|ttc|impuestos incluidos|inklusive mwst|с ндс)\b/iu';
            $taxExcluded = '/\b(before (?:tax|vat)|excluding (?:tax|vat)|(?:tax|vat)[- ]exclusive|hors taxes|ht|sin impuestos|zzgl\.? mwst|без ндс)\b/iu';
            if (($quote['tax_basis'] !== 'included' && preg_match($taxIncluded, $text))
                || ($quote['tax_basis'] !== 'excluded' && preg_match($taxExcluded, $text))) {
                return false;
            }
            foreach (['unit_price', 'charges', 'subtotal', 'total'] as $field) {
                $allowed[] = $currency.' '.BigDecimal::of($quote[$field])->strippedOfTrailingZeros();
            }
        } elseif ($quote) {
            // A fresh manager offer may supply its own figures after the recorded quote has expired.
            $allowed = array_keys(array_filter($managerAmounts));
        } else {
            if (! $claims && ! str_contains($text, '{{quote.')) {
                return true;
            }
            $sources = array_column($context['brand_knowledge']['answers'] ?? [], 'answer');
            $sources[] = $context['project_evidence']['reviewed_brand_terms'] ?? '';
            array_push($sources, ...array_column($context['brand_knowledge']['documents'] ?? [], 'excerpt'));
            // Notes may quote a buyer's budget or an old offer. Only explicitly confirmed, current terms count.
            foreach (preg_split('/\R|(?<=[.!?])\s+/u', $context['lead']['notes'] ?? '') ?: [] as $line) {
                if (preg_match('/\b(approved|confirmed|agreed|authorised|authorized|validé|convenu|aprobado|acordado|bestätigt|vereinbart|согласован\p{L}*)\b/iu', $line)
                    && ! preg_match('/\b(not|unconfirmed|expired|previous|old|superseded|non|pas|caduc\p{L}*|expir\p{L}*|nicht|abgelaufen|не)\b/iu', $line)) {
                    $sources[] = $line;
                }
            }
            if (isset($context['lead']['recorded_rate'], $context['lead']['recorded_currency'])) {
                $sources[] = $context['lead']['recorded_currency'].' '.$context['lead']['recorded_rate'];
            }
            $payment = $context['project_evidence']['recorded_fulfillment'] ?? [];
            if (! empty($payment['payment_status']) && isset($payment['paid_amount'], $payment['currency'])) {
                $sources[] = $payment['currency'].' '.$payment['paid_amount'];
            }
            $allowed = [...self::amounts(implode("\n", $sources), $currency), ...array_keys(array_filter($managerAmounts))];
        }

        return array_diff($claims, $allowed) === [];
    }

    /** Pair each percentage with its nearest commercial term, so a commission cannot verify a discount. */
    private static function commercialRates(string $text, string $title = ''): array
    {
        $types = [
            'referral' => 'referral|commission|affiliate|provision|comisi[oó]n|комисси\pL*',
            'discount' => 'discount|rabatt|remise|descuento|скидк\pL*',
            'deposit' => 'deposit|acompte|anzahlung|anticipo|предоплат\pL*',
            'tax' => 'vat|tax|tva|mwst|iva|ндс',
        ];
        $out = [];
        foreach (preg_split('/\R|;|(?<=[.!?])\s+/u', $text) ?: [] as $line) {
            preg_match_all('/\b(\d+(?:[.,]\d+)?)\h*(?:%|percent\b|per cent\b|pour cent\b|prozent\b|por ciento\b|процент\pL*)/iu', $line, $values, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
            foreach ($values as [$match, $number]) {
                $best = null;
                $distance = PHP_INT_MAX;
                foreach ($types as $type => $terms) {
                    preg_match_all('/\b(?:'.$terms.')\pL*\b/iu', $line, $labels, PREG_OFFSET_CAPTURE);
                    foreach ($labels[0] as [$label, $pos]) {
                        $gap = max($pos - $match[1] - strlen($match[0]), $match[1] - $pos - strlen($label), 0);
                        if ($gap < $distance) {
                            $best = $type;
                            $distance = $gap;
                        }
                    }
                }
                if ($best === null) {
                    foreach ($types as $type => $terms) {
                        if (preg_match('/\b(?:'.$terms.')\pL*\b/iu', $title)) {
                            $best = $type;
                            break;
                        }
                    }
                }
                if ($best !== null) {
                    $out[] = $best.' '.BigDecimal::of(str_replace(',', '.', $number[0]))->strippedOfTrailingZeros();
                }
            }
        }

        return $out;
    }

    private static function amounts(string $text, string $currency): array
    {
        // "All 100 printed cards" is a quantity. Keep ALL 100, 100 ALL and "all 100 per card" as currency claims.
        $counted = 'cards|units|items|pieces|copies|profiles|pens|products|orders|seats|guests|rooms|nights|tickets|people|licen[cs]es';
        $modifier = '(?!(?:per|each|for|plus|net|gross|before|after|including|excluding)\b)[\pL-]+\h+';
        $text = preg_replace('/\b[Aa]ll(?=\h+\d+\h+(?:'.$modifier.'){0,3}(?:'.$counted.')\b)/u', 'all of the', $text);
        $aliases = ['euros?' => 'EUR', 'pounds?(?: sterling)?' => 'GBP', 'dollars?' => '$', 'руб(?:лей|ля|ль)?' => 'RUB'];
        $symbols = implode('|', array_map(fn ($s) => preg_quote($s, '~'), array_keys(self::SYMBOLS)));
        $marker = '(?:(?<![\pL])(?:'.str_replace(' ', '|', self::CODES).'|'.implode('|', array_keys($aliases)).')(?![\pL])|'.$symbols.'|[$¥]|\p{Sc})';
        $number = '\d+(?:(?:[.,]\d+)|(?:[ \x{00a0}\x{202f}]\d{3}(?!\d)))*';
        preg_match_all('~('.$marker.')[\h]*('.$number.')|('.$number.')[\h]*('.$marker.')~iu', $text, $matches, PREG_SET_ORDER);
        $out = [];
        foreach ($matches as $row) {
            $symbol = $row[1] ?: $row[4];
            $code = self::SYMBOLS[strtoupper($symbol)] ?? strtoupper($symbol);
            foreach ($aliases as $pattern => $iso) {
                if (preg_match('~^(?:'.$pattern.')$~iu', $symbol)) {
                    $code = $iso;
                }
            }
            if ($code === '$') {
                $code = in_array($currency, ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD'], true) ? $currency : '$';
            } elseif ($code === '¥') {
                $code = in_array($currency, ['CNY', 'JPY'], true) ? $currency : '¥';
            }
            $value = preg_replace('/\h/u', '', $row[2] ?: $row[3]);
            if (str_contains($value, ',') && str_contains($value, '.')) {
                $group = strrpos($value, ',') < strrpos($value, '.') ? ',' : '.';
                $value = str_replace($group, '', $value);
            } elseif (preg_match('/^[1-9]\d{0,2}(?:[,.]\d{3})+$/D', $value)) {
                $value = str_replace([',', '.'], '', $value);
            }
            $value = str_replace(',', '.', $value);
            $out[] = $code.' '.(preg_match('/^\d+(?:\.\d+)?$/D', $value) ? BigDecimal::of($value)->strippedOfTrailingZeros() : '?');
        }

        return $out;
    }
}
