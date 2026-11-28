<?php

namespace App\Services\Crm;

/** Local search terms for a multi-topic enquiry. These are never instructions or commercial facts. */
final class EmailQuestionPlan
{
    private const PARTNER = '/\b(resell\pL*|wholesale|distribut[oe]r|white[- ]label|private[- ]label|manufacturing partner|revendeur|grossiste|wiederverkäufer|mayorista|distribuidor|оптов\pL*|реселлер\pL*)\b/iu';

    public static function needed(string $request): bool
    {
        return mb_strlen($request) > 650 || substr_count($request, '?') + substr_count($request, '？') >= 2
            || preg_match('/(?:^|\R)\s*(?:[23][.)]|[②③２３])\s/u', $request) === 1 || preg_match(self::PARTNER, $request) === 1;
    }

    public static function searches(string $request, string $background = ''): array
    {
        $partner = (bool) preg_match(self::PARTNER, $request.' '.$background);
        $questions = [];
        $lines = preg_split('/\R+|;\h*|(?<=[?!？。!])\h*|(?<=\.)\h+/u', mb_substr($request, 0, 12000), -1, PREG_SPLIT_NO_EMPTY);
        if ($background !== '') {
            $lines[] = mb_substr($background, 0, 600);
        }
        foreach (array_unique(array_map('trim', $lines)) as $line) {
            if (mb_strlen($line) < 4) {
                continue;
            }
            $terms = [];
            foreach ([
                'samples sample proof' => '/sample|échantillon|muestra|muster|образец/iu',
                'pricing price quantity' => '/price|pricing|quote|prix|tarif|precio|preis|цен[аыу]/iu',
                'shipping delivery transit' => '/shipping|delivery|livraison|entrega|versand|доставк/iu',
                'commission referral' => '/referral|commission|parrainage|provision|comisi[oó]n|комисси/iu',
                'invoice customs duty' => '/customs|duties|douane|aduana|zoll|тамож/iu',
                'reseller wholesale partner' => self::PARTNER,
            ] as $aliases => $pattern) {
                if (preg_match($pattern, $line)) {
                    $terms[] = $aliases;
                }
            }
            $scope = match (true) {
                in_array('samples sample proof', $terms, true) => 'samples',
                in_array('commission referral', $terms, true) => 'referral',
                preg_match('/\b(?:retail|rrp|prix public|precio minorista|einzelhandelspreis|розничн\pL*)\b/iu', $line) === 1 => 'retail',
                in_array('pricing price quantity', $terms, true) => $partner ? 'partner_pricing' : 'retail',
                default => 'operations',
            };
            $questions[] = ['id' => 'q'.(count($questions) + 1), 'need' => mb_substr($line, 0, 320),
                'search' => mb_substr($line, 0, 500), 'alternate' => implode(' ', $terms), 'scope' => $scope];
            if (count($questions) === 16) {
                break;
            }
        }

        return ['partner_purchase' => $partner, 'questions' => $questions];
    }
}
