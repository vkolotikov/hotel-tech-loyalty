<?php

namespace App\Services\Crm;

use App\Models\KnowledgeDocument;
use App\Models\KnowledgeItem;
use App\Services\Integrations\FdsBuilderKnowledge;
use Closure;
use Illuminate\Database\Eloquent\Builder;

/** Search each need across the same active brand sources, reserving space for later questions. */
final class SalesQuestionSearch
{
    /**
     * @param Builder<KnowledgeItem> $items
     * @param Builder<KnowledgeDocument> $documents
     */
    public function retrieve(array $plan, Builder $items, Builder $documents, Closure $tokenise): array
    {
        $queries = [];
        $ranked = [];
        foreach ($plan['questions'] as $q) {
            foreach (['search', 'alternate', 'price_subject'] as $pass) {
                $terms = $q[$pass] ?? '';
                preg_match_all('/\b(?:qr|us|uk|eu|[\pL]+\d[\pL\d.-]*|[\pL]+[-.][\pL\d.-]*\d[\pL\d.-]*)\b/iu', $terms, $special);
                $queries[$q['id']][$pass] = array_slice(array_unique([...array_map('mb_strtolower', $special[0]), ...$tokenise($terms)]), 0, 18);
            }
        }
        // Count how often each term occurs in this brand. A material, policy or product code
        // carries more weight than vocabulary that appears in nearly every answer.
        $vocabulary = [];
        foreach ($queries as $passes) {
            foreach ($passes as $words) {
                foreach ($words as $word) {
                    $token = preg_quote($word, '~');
                    $suffix = mb_strlen($word) >= 4 && ! preg_match('/\d/u', $word) ? '[\pL]{0,3}' : '';
                    $vocabulary[$word] = '~(?<![\pL\d])'.$token.$suffix.'(?![\pL\d-])~iu';
                }
            }
        }
        $frequency = [];
        $total = 0;
        foreach ($this->sources($items, $documents, $plan['partner_purchase']) as $source) {
            $total++;
            $text = $source['title'].' '.$source['keywords'].' '.$source['text'];
            foreach ($vocabulary as $word => $pattern) {
                if (preg_match($pattern, $text)) {
                    $frequency[$word] = ($frequency[$word] ?? 0) + 1;
                }
            }
        }
        foreach ($this->sources($items, $documents, $plan['partner_purchase']) as $source) {
            $weights = [];
            foreach ($vocabulary as $word => $pattern) {
                $weight = 3 * (int) preg_match($pattern, $source['title']) + 2 * (int) preg_match($pattern, $source['keywords'])
                    + (int) preg_match($pattern, $source['text']);
                if ($weight) {
                    $weights[$word] = $weight * log(1 + ($total + 1) / (($frequency[$word] ?? 0) + 0.5));
                }
            }
            foreach ($plan['questions'] as $q) {
                if ($plan['partner_purchase'] && $q['scope'] !== 'retail' && in_array($source['kind'], ['public_catalog', 'retail_price_list'], true)) {
                    continue;
                }
                $subject = $queries[$q['id']]['price_subject'];
                $subjectMatch = array_intersect_key($weights, array_flip($subject));
                foreach (['search', 'alternate'] as $pass) {
                    $words = $queries[$q['id']][$pass];
                    $score = array_sum(array_intersect_key($weights, array_flip($words)));
                    if ($score <= 0) {
                        continue;
                    }
                    if ($q['scope'] === 'samples' && (! $subject || $subjectMatch) && preg_match('/\b(sample|swatch|échantillon|muster|muestra|образец)/iu', $source['title'].' '.$source['text'])) {
                        $score *= 2;
                    }
                    // A matching price subject helps rank a source. Only its actual terms can support a figure.
                    $score += array_sum($subjectMatch);
                    $rows = $ranked[$q['id']][$pass] ?? [];
                    $rows[$source['id']] = ['score' => round($score, 2), 'source' => $source];
                    uasort($rows, fn ($a, $b) => $b['score'] <=> $a['score'] ?: strcmp($a['source']['id'], $b['source']['id']));
                    $ranked[$q['id']][$pass] = array_slice($rows, 0, 6, true);
                }
            }
        }

        $choices = [];
        $sources = [];
        $remaining = 24000;
        foreach ($plan['questions'] as &$q) {
            $first = $ranked[$q['id']]['search'] ?? [];
            $alternate = $ranked[$q['id']]['alternate'] ?? [];
            // A differently worded policy or passage can answer a condition absent from the first results.
            $merged = $first;
            foreach ($alternate as $id => $hit) {
                if ($hit['score'] > ($merged[$id]['score'] ?? 0)) {
                    $merged[$id] = $hit;
                }
            }
            uasort($merged, fn ($a, $b) => $b['score'] <=> $a['score']);
            $choices[$q['id']] = array_values(array_slice($merged, 0, 4));
            $q['matches'] = [];
        }
        unset($q);
        for ($place = 0; $place < 4; $place++) {
            foreach ($plan['questions'] as &$q) {
                $hit = $choices[$q['id']][$place] ?? null;
                if (! $hit) {
                    continue;
                }
                $source = $hit['source'];
                $id = $source['id'];
                if (! isset($sources[$id])) {
                    if ($remaining < 200 || count($sources) >= 24) {
                        continue;
                    }
                    $source['text'] = mb_substr($source['text'], 0, min(2000, $remaining));
                    $remaining -= mb_strlen($source['text']);
                    $sources[$id] = $source;
                }
                $q['matches'][] = ['id' => $id, 'score' => $hit['score']];
            }
            unset($q);
        }

        $answers = $docs = [];
        foreach ($sources as $source) {
            $meta = ['id' => $source['id'], 'kind' => $source['kind'], 'updated' => $source['updated']];
            if (str_starts_with($source['id'], 'doc-')) {
                $docs[] = $meta + ['title' => $source['title'], 'excerpt' => $source['text']];
            } else {
                $answers[] = $meta + ['question' => $source['title'], 'answer' => $source['text']];
            }
        }

        return ['answers' => $answers, 'documents' => $docs, 'plan' => $plan];
    }

    private function priceScope(string $title, string $passage, string $default): string
    {
        $text = $title.' '.$passage;
        $retailOnly = preg_match('/\b(?:(?:retail|public|consumer|list)\s+(?:unit\s+)?pric(?:es?|ing)|rrp|prix public|tarif public|precio (?:público|minorista)|einzelhandelspreis|розничн\pL*\s+цен\pL*)\b/iu', $text);
        $partner = preg_match('/\b(?:wholesale|reseller|distributor|partner pric\pL*|revendeur|grossiste|wiederverkäufer|mayorista|оптов\pL*)\b/iu', $text);

        return $retailOnly && ! $partner ? 'retail_price_list' : $default;
    }

    /**
     * Iterate scoped sources twice without retaining a tenant's full document library in memory.
     * @param Builder<KnowledgeItem> $items
     * @param Builder<KnowledgeDocument> $documents
     */
    private function sources(Builder $items, Builder $documents, bool $partner): \Generator
    {
        foreach ((clone $items)->lazyById(100) as $item) {
            $catalog = str_starts_with((string) $item->source_key, FdsBuilderKnowledge::PREFIX);
            $keywords = implode(' ', $item->keywords ?? []);
            if ($catalog && $partner && preg_match('/^1 cards —/mu', (string) $item->answer) && ! str_ends_with($item->source_key, '.priority')) {
                $product = str_replace('FDS builder prices · ', '', $item->question);
                yield ['id' => 'product-'.$item->id, 'kind' => 'public_product_quantity', 'title' => $product, 'keywords' => $keywords,
                    'text' => $product.'. The published product list includes a quantity of one card.', 'updated' => $item->source_checked_at];
            }
            $kind = $this->priceScope($item->question.' '.$keywords, (string) $item->answer, 'active_brand_answer');
            yield ['id' => 'faq-'.$item->id, 'kind' => $catalog ? 'public_catalog' : $kind,
                'title' => (string) $item->question, 'keywords' => $keywords, 'text' => (string) $item->answer,
                'updated' => $item->source_checked_at ?? $item->updated_at?->toDateString()];
        }
        foreach ((clone $documents)->select(['id', 'file_name', 'extracted_text', 'updated_at'])->lazyById(8) as $doc) {
            $chunks = mb_str_split((string) $doc->extracted_text, 1100);
            foreach ($chunks as $index => $chunk) {
                $passage = trim($chunk.mb_substr($chunks[$index + 1] ?? '', 0, 300));
                yield ['id' => 'doc-'.$doc->id.'-'.($index + 1), 'kind' => $this->priceScope($doc->file_name, $passage, 'brand_document'),
                    'title' => (string) $doc->file_name, 'keywords' => '', 'text' => $passage, 'updated' => $doc->updated_at?->toDateString()];
            }
        }
    }
}
