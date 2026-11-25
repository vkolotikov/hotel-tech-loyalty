<?php

namespace App\Services;

use App\Exceptions\AiHelperRefused;
use App\Models\Brand;
use App\Models\KnowledgeDocument;
use App\Models\KnowledgeItem;
use App\Models\Organization;
use App\Scopes\BrandScope;
use App\Services\Crm\SalesProfile;
use App\Services\Integrations\FdsBuilderKnowledge;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class KnowledgeService
{
    /**
     * Multi-lingual stop words. These are lexical filler that would otherwise
     * match almost every FAQ entry and drown out real signal. The list
     * deliberately covers the main languages the widget ships to (EN/ES/FR/
     * DE/IT/PT/RU) — adding a language here costs ~40 bytes, missing one
     * causes every German "wo ist" query to match every entry mentioning "der".
     */
    private const STOP_WORDS = [
        // English
        'the','and','for','are','but','not','you','all','can','had','her','was','one',
        'our','out','has','have','been','some','them','than','its','over','such','that',
        'this','with','will','each','from','they','were','which','their','said','what',
        'when','who','how','does','your','about','would','there','could','other','into',
        'more','also','any','tell','please','want','need','like','just','know','is','it',
        'be','to','of','in','on','at','as','by','or','if','so','do','am','my','me','we',
        // Spanish
        'que','por','con','las','los','una','uno','del','para','como','pero','este','esta',
        'esto','muy','tambien','donde','cuando','porque','porqué','hola','gracias','tengo',
        'tiene','puedo','puede','hay','quiero','necesito',
        // French
        'que','pour','avec','les','des','une','cette','dans','mais','comme','aussi','tres',
        'très','ou','où','quand','pourquoi','bonjour','merci','est','sont','avez','avoir',
        'voudrais','peux','peut','besoin',
        // German
        'der','die','das','und','mit','für','von','ein','eine','einen','auf','nicht','wie',
        'wo','wann','warum','ist','sind','hat','haben','ich','sie','möchte','mochte','brauche',
        // Italian
        'che','per','con','una','uno','del','della','dei','degli','delle','come','ma',
        'molto','dove','quando','perche','perché','ciao','grazie','sono','hai','ho','vorrei',
        // Portuguese
        'que','para','com','uma','dos','das','como','mas','muito','onde','quando','porque',
        'por que','ola','olá','obrigado','obrigada','tenho','tem','queria','quero','preciso',
        // Russian (Cyrillic — lowercased)
        'что','как','для','или','это','тот','так','что','где','когда','почему','привет',
        'спасибо','есть','нет','хочу','нужно','можно','мне','вы','мы','они','он','она',
    ];

    /**
     * Tokenise a natural-language query into scoring words. Works for
     * Latin-script AND non-Latin scripts (Cyrillic, Greek, CJK etc.) — we
     * split on whitespace and punctuation, lowercase, drop short/filler
     * tokens. CJK: since there are no word boundaries, we fall back to
     * treating each 2+ char n-gram-like chunk the way we split gives a
     * practical signal for FAQ matching. Good enough without a tokeniser.
     */
    private function tokeniseQuery(string $query): array
    {
        $q = mb_strtolower(trim($query), 'UTF-8');
        // Split on any non-letter/non-digit in a unicode-aware way.
        $raw = preg_split('/[^\p{L}\p{N}]+/u', $q, -1, PREG_SPLIT_NO_EMPTY);
        if (!$raw) return [];

        $words = [];
        foreach ($raw as $w) {
            $len = mb_strlen($w, 'UTF-8');
            // Latin-script words need 3+ chars to mean something; for non-Latin
            // (Cyrillic, CJK, Arabic, Hebrew…) a 2-char token often carries
            // real meaning, so we keep those.
            $isLatin = preg_match('/^[a-z0-9]+$/u', $w) === 1;
            if ($isLatin && $len < 3) continue;
            if ($len < 2) continue;
            if (in_array($w, self::STOP_WORDS, true)) continue;
            $words[] = $w;
        }
        return array_values(array_unique($words));
    }

    /**
     * Search knowledge items relevant to a query. Fetches a superset by
     * case-insensitive text and keyword matches, then scores by how many tokens the item's
     * question/answer/keywords hit (weighted: question > keywords > answer),
     * boosted by the admin-set priority. Returns the top $limit items.
     */
    public function searchRelevantItems(string $query, int $orgId, int $limit = 5, ?int $brandId = null): Collection
    {
        $brand = $this->resolveBrand($orgId, $brandId);

        return $this->rankedItems($this->items($orgId, $brand), $this->words($query), $limit);
    }

    private function resolveBrand(int $orgId, ?int $id): ?Brand
    {
        $id ??= Brand::currentOrDefaultIdForOrg($orgId);
        return $id === null ? null : Brand::query()->where('organization_id', $orgId)->findOrFail($id);
    }

    /** @return Builder<KnowledgeItem> */
    private function items(int $orgId, ?Brand $brand): Builder
    {
        return KnowledgeItem::withoutGlobalScope(BrandScope::class)->where('organization_id', $orgId)
            ->where(fn ($q) => $q->where('brand_id', $brand?->id)->when($brand?->is_default, fn ($q) => $q->orWhereNull('brand_id')))
            ->when(FdsBuilderKnowledge::owns($brand), fn ($q) => $q->where(fn ($q) => $q->whereNull('source_key')
                ->orWhere('source_key', 'not like', FdsBuilderKnowledge::PREFIX.'%')
                ->orWhere('source_checked_at', '>=', now()->subHours(FdsBuilderKnowledge::FRESH_HOURS))))
            ->active();
    }

    private function words(string $query): array
    {
        return array_slice($this->tokeniseQuery(mb_substr($query, 0, 8000)), 0, 60);
    }

    /** @param Builder<KnowledgeItem> $base */
    private function rankedItems(Builder $base, array $words, int $limit): Collection
    {
        if (empty($words)) {
            return $base->orderByDesc('priority')->orderByDesc('use_count')->orderBy('id')->limit($limit)->get();
        }

        // Pull a broader candidate set so the scoring step has material to work
        // with — a single matching token shouldn't exclude an item that would
        // have scored high on others.
        $candidates = $base
            ->where(function ($q) use ($words) {
                foreach ($words as $word) {
                    $q->orWhereLike('question', "%{$word}%")
                      ->orWhereLike('answer', "%{$word}%")
                      ->orWhereJsonContains('keywords', $word);
                }
            })
            ->orderByDesc('priority')
            ->orderByDesc('use_count')
            ->limit(max(25, $limit * 5))
            ->get();

        if ($candidates->isEmpty()) {
            return $candidates;
        }

        // Score each candidate by weighted hit count. Priority is a multiplier
        // so an admin-flagged "featured" item outranks a generic match.
        $scored = $candidates->map(function ($item) use ($words) {
            $q = mb_strtolower((string) $item->question, 'UTF-8');
            $a = mb_strtolower((string) $item->answer, 'UTF-8');
            $kw = is_array($item->keywords) ? array_map(fn($k) => mb_strtolower((string) $k, 'UTF-8'), $item->keywords) : [];

            $score = 0;
            foreach ($words as $w) {
                if (str_contains($q, $w))  $score += 3;
                if (in_array($w, $kw, true)) $score += 2;
                if (str_contains($a, $w))  $score += 1;
            }
            // Priority: 0–10 from admin. Add it (not multiply) so a priority-10
            // item still needs SOME textual signal to surface.
            $score += (int) ($item->priority ?? 0);
            $item->setAttribute('_score', $score);
            return $item;
        });

        return $scored
            ->sortByDesc(fn($i) => $i->getAttribute('_score'))
            ->take($limit)
            ->values();
    }

    /** @return Builder<KnowledgeDocument> */
    private function documents(int $orgId, ?Brand $brand): Builder
    {
        return KnowledgeDocument::withoutGlobalScope(BrandScope::class)->where('organization_id', $orgId)
            ->where(fn ($q) => $q->where('brand_id', $brand?->id)->when($brand?->is_default, fn ($q) => $q->orWhereNull('brand_id')))
            ->completed()->whereNotNull('extracted_text');
    }

    public function inventory(Brand $brand): array
    {
        return ['answers' => $this->items((int) $brand->organization_id, $brand)->count(),
            'documents' => $this->documents((int) $brand->organization_id, $brand)->count()];
    }

    public function captureSources(Brand $brand): array
    {
        $sources = [];
        $remaining = 80000;
        // Prices stay in the live source. A profile captured today must not turn them into permanent company facts.
        $base = $this->items((int) $brand->organization_id, $brand)
            ->when(FdsBuilderKnowledge::owns($brand), fn ($q) => $q->where(fn ($q) => $q->whereNull('source_key')
                ->orWhere('source_key', 'not like', FdsBuilderKnowledge::PREFIX.'%')));
        $items = $this->rankedItems($base, [], 80);
        foreach ($items as $item) {
            $text = mb_substr((string) $item->answer, 0, min(4500, $remaining));
            if ($text !== '') {
                $sources['answer-'.$item->id] = ['type' => 'knowledge_answer', 'title' => $item->question, 'text' => $text];
                $remaining -= mb_strlen($text);
            }
        }
        foreach ($this->documents((int) $brand->organization_id, $brand)->latest('updated_at')->limit(8)->cursor() as $doc) {
            $text = (string) $doc->extracted_text;
            $length = mb_strlen($text);
            if ($length > 10000) {
                $text = mb_substr($text, 0, 4000)."\n…\n".mb_substr($text, intdiv($length, 2) - 1500, 3000)."\n…\n".mb_substr($text, -3000);
            }
            $sources['document-'.$doc->id] = ['type' => 'knowledge_document', 'title' => $doc->file_name, 'text' => $text];
        }
        return $sources;
    }

    private function identifierHit(string $text, string $id): bool
    {
        return (bool) preg_match('/(?<![\pL\d-])'.preg_quote($id, '/').'(?![\pL\d-])/iu', $text);
    }

    /** Match exact model references first, then rank relevant brand answers and document passages. */
    public function forSales(string $query, Brand $brand): array
    {
        $query = mb_strtolower(mb_substr($query, 0, 8000));
        preg_match_all('/(?<![\pL\d-])(?=[\pL\d.-]{1,40}(?![\pL\d.-]))(?=[\pL\d.-]*\d)\pL[\pL\d]*(?:[-.][\pL\d]+)*(?![\pL\d-])/u', $query, $matches);
        $ids = array_slice(array_unique($matches[0]), 0, 12);
        $words = $this->words($query);
        foreach ([
            ['pricing', 'price', 'tarif', 'precio', 'prix', 'preis', 'цена'],
            ['shipping', 'delivery', 'livraison', 'entrega', 'versand', 'доставка'],
            ['sample', 'échantillon', 'muestra', 'muster', 'образец'],
            ['invoice', 'facture', 'factura', 'rechnung', 'счёт'],
        ] as $terms) {
            if (array_intersect($words, $terms)) {
                $words = array_values(array_unique([...$words, ...$terms]));
            }
        }
        $base = $this->items((int) $brand->organization_id, $brand);
        $matched = $words ? $this->rankedItems(clone $base, $words, 12) : collect();
        $exact = collect();
        if ($ids) {
            $candidates = (clone $base)->where(function ($q) use ($ids) {
                foreach ($ids as $id) {
                    $q->orWhereLike('question', "%{$id}%")->orWhereLike('answer', "%{$id}%")->orWhereJsonContains('keywords', $id);
                }
            })->orderByDesc('priority')->orderBy('id')->cursor();
            foreach ($candidates as $item) {
                $content = $item->question.' '.$item->answer.' '.implode(' ', $item->keywords ?? []);
                if (array_any($ids, fn ($id) => $this->identifierHit($content, $id))) {
                    $exact->push($item);
                    if ($exact->count() >= 12) {
                        break;
                    }
                }
            }
        }
        $items = $exact->concat($matched)->unique('id');
        if ($items->isEmpty() && ! $ids) {
            $items = $this->rankedItems($base, [], 4);
        }
        $answers = [];
        $remaining = 22000;
        foreach ($items->take(12) as $item) {
            $question = mb_substr((string) $item->question, 0, 500);
            $answer = mb_substr((string) $item->answer, 0, 4500);
            $length = mb_strlen($question) + mb_strlen($answer);
            if ($remaining < 1) {
                break;
            }
            if ($length > $remaining) {
                continue;
            }
            $answers[] = ['question' => $question, 'answer' => $answer];
            $remaining -= $length;
        }

        return ['answers' => $answers, 'documents' => $this->excerpts(array_unique([...$ids, ...$words]), (int) $brand->organization_id, $brand, $ids)];
    }

    public function getKnowledgeContext(string $query, int $orgId, ?int $brandId = null, bool $countUse = true): string
    {
        $brand = $this->resolveBrand($orgId, $brandId);
        $base = $this->items($orgId, $brand);
        $words = $this->words($query);
        $items = $this->rankedItems(clone $base, $words, 5);
        if ($countUse && $items->isNotEmpty()) {
            $base->whereKey($items->pluck('id')->all())->increment('use_count');
        }

        $parts = [];
        if ($brand && ($facts = app(SalesProfile::class)->publicFacts($brand))) {
            $parts[] = "Reviewed company facts for customers:\n".json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        }
        foreach ($items as $item) {
            $parts[] = "Q: {$item->question}\nA: {$item->answer}";
        }
        foreach ($this->excerpts($words, $orgId, $brand) as $doc) {
            $parts[] = "From document \"{$doc['title']}\":\n{$doc['excerpt']}";
        }

        return implode("\n\n", $parts);
    }

    private function excerpts(array $words, int $orgId, ?Brand $brand, array $ids = []): array
    {
        if (! $words) {
            return [];
        }
        $docs = $this->documents($orgId, $brand)->select(['id', 'file_name', 'extracted_text'])
            ->where(function ($q) use ($words) {
                foreach ($words as $word) {
                    $q->orWhereLike('extracted_text', "%{$word}%");
                }
            })->orderBy('id')->cursor();
        $best = [];
        foreach ($docs as $doc) {
            $text = (string) $doc->extracted_text;
            $chunks = mb_str_split($text, 1100);
            $score = 0;
            $excerpt = '';
            foreach ($chunks as $index => $chunk) {
                $passage = $chunk.mb_substr($chunks[$index + 1] ?? '', 0, 300);
                $lower = mb_strtolower($passage);
                $hits = count(array_filter(array_diff($words, $ids), fn ($word) => str_contains($lower, $word)))
                    + 20 * count(array_filter($ids, fn ($id) => $this->identifierHit($lower, $id)));
                if ($hits > $score) {
                    $score = $hits;
                    $excerpt = $passage;
                }
            }
            if ($score > 0) {
                $best[] = ['score' => $score, 'title' => $doc->file_name, 'excerpt' => trim($excerpt)];
                usort($best, fn ($a, $b) => $b['score'] <=> $a['score']);
                $best = array_slice($best, 0, 4);
            }
        }

        return array_map(fn ($row) => ['title' => $row['title'], 'excerpt' => $row['excerpt']], $best);
    }

    /**
     * Process an uploaded document to extract text content.
     */
    public function processDocument(KnowledgeDocument $doc): void
    {
        $tmpPath = null;
        try {
            $doc->update(['processing_status' => 'processing']);

            // Resolve the actual file path — handle both local and cloud (DO Spaces) storage.
            if (str_starts_with($doc->file_path, 'http')) {
                // Cloud storage URL — download to a temp file so text extraction works.
                $ext = strtolower(pathinfo(parse_url($doc->file_path, PHP_URL_PATH), PATHINFO_EXTENSION));
                $tmpPath = tempnam(sys_get_temp_dir(), 'kb_doc_') . ($ext ? ".{$ext}" : '');
                $response = \Illuminate\Support\Facades\Http::timeout(120)->get($doc->file_path);
                if ($response->failed()) {
                    Log::error('Document download from cloud failed', ['url' => $doc->file_path, 'status' => $response->status()]);
                    $doc->update(['processing_status' => 'failed']);
                    return;
                }
                file_put_contents($tmpPath, $response->body());
                $fullPath = $tmpPath;
            } else {
                $relativePath = str_starts_with($doc->file_path, '/storage/')
                    ? substr($doc->file_path, 9)
                    : $doc->file_path;
                $fullPath = storage_path('app/public/' . $relativePath);
            }

            if (!file_exists($fullPath)) {
                Log::warning('Document file not found for processing', ['path' => $fullPath]);
                $doc->update(['processing_status' => 'failed']);
                return;
            }

            $text = match ($doc->mime_type) {
                'text/plain' => file_get_contents($fullPath),
                'application/pdf' => $this->extractFromPdf($fullPath),
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => $this->extractFromDocx($fullPath),
                default => null,
            };

            if ($text === null) {
                $doc->update(['processing_status' => 'failed']);
                return;
            }

            $chunks = $this->chunkText($text);

            $doc->update([
                'extracted_text' => $text,
                'chunks_count'   => count($chunks),
                'processing_status' => 'completed',
            ]);
        } catch (\Throwable $e) {
            Log::error('Document processing failed', [
                'document_id' => $doc->id,
                'error' => $e->getMessage(),
            ]);
            $doc->update(['processing_status' => 'failed']);
        } finally {
            // Always clean up the temporary file if we created one.
            if ($tmpPath && file_exists($tmpPath)) {
                @unlink($tmpPath);
            }
        }
    }

    private function extractFromPdf(string $path): ?string
    {
        if (!class_exists(\Smalot\PdfParser\Parser::class)) {
            Log::warning('smalot/pdfparser not installed, skipping PDF extraction');
            return null;
        }

        $parser = new \Smalot\PdfParser\Parser();
        $pdf = $parser->parseFile($path);
        return $pdf->getText();
    }

    private function extractFromDocx(string $path): ?string
    {
        if (!class_exists(\PhpOffice\PhpWord\IOFactory::class)) {
            Log::warning('phpoffice/phpword not installed, skipping DOCX extraction');
            return null;
        }

        $phpWord = \PhpOffice\PhpWord\IOFactory::load($path);
        $text = '';
        foreach ($phpWord->getSections() as $section) {
            $text .= $this->extractElementsText($section->getElements());
        }
        return $text ?: null;
    }

    /**
     * Recursively extract text from PhpWord elements (handles tables, text runs, etc.)
     */
    private function extractElementsText(iterable $elements): string
    {
        $text = '';
        foreach ($elements as $element) {
            if ($element instanceof \PhpOffice\PhpWord\Element\TextRun) {
                foreach ($element->getElements() as $child) {
                    if (method_exists($child, 'getText')) {
                        $text .= $child->getText();
                    }
                }
                $text .= "\n";
            } elseif ($element instanceof \PhpOffice\PhpWord\Element\Table) {
                foreach ($element->getRows() as $row) {
                    $cells = [];
                    foreach ($row->getCells() as $cell) {
                        $cells[] = trim($this->extractElementsText($cell->getElements()));
                    }
                    $text .= implode(' | ', $cells) . "\n";
                }
                $text .= "\n";
            } elseif ($element instanceof \PhpOffice\PhpWord\Element\ListItemRun) {
                foreach ($element->getElements() as $child) {
                    if (method_exists($child, 'getText')) {
                        $text .= $child->getText();
                    }
                }
                $text .= "\n";
            } elseif (method_exists($element, 'getText')) {
                $text .= $element->getText() . "\n";
            } elseif (method_exists($element, 'getElements')) {
                $text .= $this->extractElementsText($element->getElements());
            }
        }
        return $text;
    }

    /**
     * Use the AI to read a free-form blob of source text (e.g. a hotel
     * description, policy doc, fact sheet) and extract a clean list of
     * Q&A pairs the admin can preview before importing into the KB.
     *
     * Returns a list of arrays: [['question' => ..., 'answer' => ..., 'keywords' => [...]]
     *
     * 2026-11-08: refused with `ai_budget_used_up` (AiHelperRefused, 403) before the provider is asked once the
     * organisation's month of AI is spent; the call's spend is recorded as feature `knowledge_faqs`; a provider failure
     * (or no key) is `ai_failed` (502), with the provider's own text in the log only. An empty list now means the AI
     * found nothing to ask in the text.
     */
    public function generateFaqsFromText(string $sourceText, int $maxItems = 12, ?int $orgId = null): array
    {
        $sourceText = trim($sourceText);
        if ($sourceText === '') {
            return [];
        }

        $orgId ??= app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;
        AiHelperRefused::unlessAllowanceLeft($orgId ? Organization::withoutGlobalScopes()->find($orgId) : null);

        $apiKey = config('openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            Log::warning('FAQ extraction skipped: no OPENAI_API_KEY configured');
            throw AiHelperRefused::failed();
        }
        $model = (string) env('OPENAI_MODEL', 'gpt-4o-mini');

        $prompt = "You are creating an FAQ knowledge base for a hotel chatbot. " .
            "Read the source material below and produce up to {$maxItems} concise, factual " .
            "question/answer pairs covering the most useful things a guest would ask. " .
            "Use the guest's natural phrasing for questions. Keep answers under 60 words. " .
            "Do not invent facts that aren't in the source. Return JSON only.\n\n" .
            "SOURCE:\n" . mb_substr($sourceText, 0, 12000);

        try {
            $response = \Illuminate\Support\Facades\Http::withToken($apiKey)
                ->timeout(60)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'messages' => [
                        ['role' => 'system', 'content' => 'You output only valid JSON matching the requested schema.'],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                    'response_format' => [
                        'type' => 'json_schema',
                        'json_schema' => [
                            'name' => 'faq_extraction',
                            'strict' => true,
                            'schema' => [
                                'type' => 'object',
                                'additionalProperties' => false,
                                'required' => ['items'],
                                'properties' => [
                                    'items' => [
                                        'type' => 'array',
                                        'items' => [
                                            'type' => 'object',
                                            'additionalProperties' => false,
                                            'required' => ['question', 'answer', 'keywords'],
                                            'properties' => [
                                                'question' => ['type' => 'string'],
                                                'answer'   => ['type' => 'string'],
                                                'keywords' => ['type' => 'array', 'items' => ['type' => 'string']],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                    'temperature' => 0.3,
                ]);
        } catch (\Throwable $e) {
            Log::error('FAQ extraction crashed: ' . $e->getMessage());
            throw AiHelperRefused::failed();
        }

        if (!$response->successful()) {
            Log::warning('FAQ extraction OpenAI call failed', ['status' => $response->status(), 'body' => $response->body()]);
            throw AiHelperRefused::failed();
        }

        if ($orgId) {
            app(AiUsageService::class)->recordUsage(
                orgId: $orgId,
                model: $model,
                inputTokens: (int) $response->json('usage.prompt_tokens', 0),
                outputTokens: (int) $response->json('usage.completion_tokens', 0),
                feature: 'knowledge_faqs',
            );
        }

        $parsed = json_decode((string) $response->json('choices.0.message.content'), true);
        if (!is_array($parsed) || !array_key_exists('items', $parsed) || !is_array($parsed['items'])) {
            Log::warning('FAQ extraction answered no items list', ['org_id' => $orgId]);
            throw AiHelperRefused::failed();
        }

        return array_values(array_filter($parsed['items'], fn ($item) => is_array($item)
            && trim((string) ($item['question'] ?? '')) !== '' && trim((string) ($item['answer'] ?? '')) !== ''));
    }

    private function chunkText(string $text, int $chunkSize = 1000): array
    {
        $words = explode(' ', $text);
        $chunks = [];
        $current = '';

        foreach ($words as $word) {
            if (strlen($current) + strlen($word) + 1 > $chunkSize) {
                $chunks[] = trim($current);
                $current = $word;
            } else {
                $current .= ' ' . $word;
            }
        }

        if (trim($current)) {
            $chunks[] = trim($current);
        }

        return $chunks;
    }
}
