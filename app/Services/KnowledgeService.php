<?php

namespace App\Services;

use App\Models\KnowledgeDocument;
use App\Models\KnowledgeItem;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class KnowledgeService
{
    /**
     * Search knowledge items relevant to a query using keyword matching.
     */
    public function searchRelevantItems(string $query, int $orgId, int $limit = 5): Collection
    {
        $words = array_filter(explode(' ', strtolower(trim($query))), fn($w) => strlen($w) >= 3);

        if (empty($words)) {
            return KnowledgeItem::where('organization_id', $orgId)
                ->active()
                ->orderByDesc('priority')
                ->limit($limit)
                ->get();
        }

        return KnowledgeItem::where('organization_id', $orgId)
            ->active()
            ->where(function ($q) use ($words) {
                foreach ($words as $word) {
                    $q->orWhere('question', 'ILIKE', "%{$word}%")
                      ->orWhere('answer', 'ILIKE', "%{$word}%")
                      ->orWhereJsonContains('keywords', $word);
                }
            })
            ->orderByDesc('priority')
            ->limit($limit)
            ->get();
    }

    /**
     * Build knowledge context string for injection into AI prompt.
     */
    public function getKnowledgeContext(string $query, int $orgId): string
    {
        $items = $this->searchRelevantItems($query, $orgId);

        if ($items->isEmpty()) {
            return '';
        }

        // Increment use counts
        KnowledgeItem::whereIn('id', $items->pluck('id'))->increment('use_count');

        $context = "## Relevant Knowledge Base\n\n";
        foreach ($items as $item) {
            $context .= "**Q:** {$item->question}\n**A:** {$item->answer}\n\n";
        }

        // Add relevant document excerpts
        $docs = KnowledgeDocument::where('organization_id', $orgId)
            ->completed()
            ->whereNotNull('extracted_text')
            ->get();

        foreach ($docs as $doc) {
            $text = $doc->extracted_text;
            if (empty($text)) continue;

            // Simple relevance check: does the document mention any query words?
            $lowerText = strtolower($text);
            $words = array_filter(explode(' ', strtolower(trim($query))), fn($w) => strlen($w) >= 3);
            $relevant = false;
            foreach ($words as $word) {
                if (str_contains($lowerText, $word)) {
                    $relevant = true;
                    break;
                }
            }

            if ($relevant) {
                $excerpt = mb_substr($text, 0, 800);
                $context .= "**From document \"{$doc->file_name}\":**\n{$excerpt}\n\n";
            }
        }

        return $context;
    }

    /**
     * Process an uploaded document to extract text content.
     */
    public function processDocument(KnowledgeDocument $doc): void
    {
        try {
            $doc->update(['processing_status' => 'processing']);

            $fullPath = storage_path('app/public/' . ltrim($doc->file_path, '/storage/'));
            if (!file_exists($fullPath)) {
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
                'chunks_count' => count($chunks),
                'processing_status' => 'completed',
            ]);
        } catch (\Throwable $e) {
            Log::error('Document processing failed', [
                'document_id' => $doc->id,
                'error' => $e->getMessage(),
            ]);
            $doc->update(['processing_status' => 'failed']);
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
            foreach ($section->getElements() as $element) {
                if (method_exists($element, 'getText')) {
                    $text .= $element->getText() . "\n";
                }
            }
        }
        return $text;
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
