<?php

namespace App\Services;

use App\Models\KnowledgeDocument;
use App\Models\KnowledgeItem;
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
     * ILIKE/JSON match, then scores in-memory by how many tokens the item's
     * question/answer/keywords hit (weighted: question > keywords > answer),
     * boosted by the admin-set priority. Returns the top $limit items.
     */
    public function searchRelevantItems(string $query, int $orgId, int $limit = 5): Collection
    {
        $words = $this->tokeniseQuery($query);

        if (empty($words)) {
            return KnowledgeItem::where('organization_id', $orgId)
                ->active()
                ->orderByDesc('priority')
                ->orderByDesc('use_count')
                ->limit($limit)
                ->get();
        }

        // Pull a broader candidate set so the scoring step has material to work
        // with — a single matching token shouldn't exclude an item that would
        // have scored high on others.
        $candidates = KnowledgeItem::where('organization_id', $orgId)
            ->active()
            ->where(function ($q) use ($words) {
                foreach ($words as $word) {
                    $q->orWhere('question', 'ILIKE', "%{$word}%")
                      ->orWhere('answer', 'ILIKE', "%{$word}%")
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

    /**
     * Build knowledge context string for injection into AI prompt.
     */
    public function getKnowledgeContext(string $query, int $orgId): string
    {
        $items = $this->searchRelevantItems($query, $orgId);
        $words = $this->tokeniseQuery($query);

        $hasItems = !$items->isEmpty();
        if ($hasItems) {
            KnowledgeItem::whereIn('id', $items->pluck('id'))->increment('use_count');
        }

        $context = '';
        if ($hasItems) {
            $context .= "Below are the most relevant FAQ entries for this query, ranked by relevance. Treat these as authoritative.\n\n";
            foreach ($items as $item) {
                $context .= "Q: {$item->question}\nA: {$item->answer}\n\n";
            }
        }

        // Document excerpts — score by overlap instead of first-hit-wins so the
        // most relevant doc surfaces, and truncate to a reasonable slice.
        $docs = KnowledgeDocument::where('organization_id', $orgId)
            ->completed()
            ->whereNotNull('extracted_text')
            ->get();

        if ($docs->isNotEmpty() && !empty($words)) {
            $docScored = [];
            foreach ($docs as $doc) {
                $text = (string) $doc->extracted_text;
                if ($text === '') continue;
                $lower = mb_strtolower($text, 'UTF-8');
                $hits = 0;
                foreach ($words as $w) {
                    if (mb_strpos($lower, $w) !== false) $hits++;
                }
                if ($hits > 0) {
                    // Locate the first hit to extract a nearby excerpt instead
                    // of always using the opening of the document.
                    $firstPos = null;
                    foreach ($words as $w) {
                        $p = mb_strpos($lower, $w);
                        if ($p !== false && ($firstPos === null || $p < $firstPos)) $firstPos = $p;
                    }
                    $start = max(0, ($firstPos ?? 0) - 120);
                    $excerpt = mb_substr($text, $start, 900);
                    $docScored[] = ['doc' => $doc, 'hits' => $hits, 'excerpt' => trim($excerpt)];
                }
            }

            usort($docScored, fn($a, $b) => $b['hits'] <=> $a['hits']);
            foreach (array_slice($docScored, 0, 2) as $d) {
                $context .= "From document \"{$d['doc']->file_name}\":\n{$d['excerpt']}\n\n";
            }
        }

        return trim($context);
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
     */
    public function generateFaqsFromText(string $sourceText, int $maxItems = 12): array
    {
        $sourceText = trim($sourceText);
        if ($sourceText === '') {
            return [];
        }

        $apiKey = config('openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            Log::warning('FAQ extraction skipped: no OPENAI_API_KEY configured');
            return [];
        }

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
                    'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
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

            if (!$response->successful()) {
                Log::warning('FAQ extraction OpenAI call failed', ['status' => $response->status(), 'body' => $response->body()]);
                return [];
            }

            $content = $response->json('choices.0.message.content');
            $parsed = json_decode($content, true);
            return is_array($parsed['items'] ?? null) ? $parsed['items'] : [];
        } catch (\Throwable $e) {
            Log::error('FAQ extraction crashed: ' . $e->getMessage());
            return [];
        }
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
