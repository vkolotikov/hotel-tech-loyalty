<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\KnowledgeCategory;
use App\Models\KnowledgeDocument;
use App\Models\KnowledgeItem;
use App\Services\KnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KnowledgeBaseController extends Controller
{
    public function __construct(protected KnowledgeService $knowledgeService) {}

    // ─── Categories ───

    public function indexCategories(Request $request): JsonResponse
    {
        $categories = KnowledgeCategory::where('organization_id', $request->user()->organization_id)
            ->withCount('items')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($categories);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'        => 'required|string|max:120',
            'description' => 'nullable|string|max:1000',
            'priority'    => 'nullable|integer|min:0',
            'sort_order'  => 'nullable|integer|min:0',
            'is_active'   => 'nullable|boolean',
        ]);

        $category = KnowledgeCategory::create(array_merge($validated, [
            'organization_id' => $request->user()->organization_id,
        ]));

        return response()->json($category, 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = KnowledgeCategory::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name'        => 'nullable|string|max:120',
            'description' => 'nullable|string|max:1000',
            'priority'    => 'nullable|integer|min:0',
            'sort_order'  => 'nullable|integer|min:0',
            'is_active'   => 'nullable|boolean',
        ]);

        $category->update($validated);

        return response()->json($category);
    }

    public function destroyCategory(Request $request, int $id): JsonResponse
    {
        $category = KnowledgeCategory::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $category->delete();

        return response()->json(['message' => 'Deleted']);
    }

    // ─── Items ───

    public function indexItems(Request $request): JsonResponse
    {
        $query = KnowledgeItem::where('organization_id', $request->user()->organization_id)
            ->with('category:id,name');

        if ($request->category_id) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('question', 'ILIKE', "%{$search}%")
                  ->orWhere('answer', 'ILIKE', "%{$search}%");
            });
        }

        $items = $query->orderByDesc('priority')->orderByDesc('use_count')->get();

        return response()->json($items);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'nullable|exists:knowledge_categories,id',
            'question'    => 'required|string|max:500',
            'answer'      => 'required|string|max:5000',
            'keywords'    => 'nullable|array',
            'keywords.*'  => 'string|max:50',
            'priority'    => 'nullable|integer|min:0',
            'is_active'   => 'nullable|boolean',
        ]);

        $item = KnowledgeItem::create(array_merge($validated, [
            'organization_id' => $request->user()->organization_id,
        ]));

        return response()->json($item->load('category:id,name'), 201);
    }

    public function updateItem(Request $request, int $id): JsonResponse
    {
        $item = KnowledgeItem::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'category_id' => 'nullable|exists:knowledge_categories,id',
            'question'    => 'nullable|string|max:500',
            'answer'      => 'nullable|string|max:5000',
            'keywords'    => 'nullable|array',
            'keywords.*'  => 'string|max:50',
            'priority'    => 'nullable|integer|min:0',
            'is_active'   => 'nullable|boolean',
        ]);

        $item->update($validated);

        return response()->json($item->load('category:id,name'));
    }

    public function destroyItem(Request $request, int $id): JsonResponse
    {
        $item = KnowledgeItem::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $item->delete();

        return response()->json(['message' => 'Deleted']);
    }

    // ─── Documents ───

    public function indexDocuments(Request $request): JsonResponse
    {
        $docs = KnowledgeDocument::where('organization_id', $request->user()->organization_id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json($docs);
    }

    public function uploadDocument(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|max:10240|mimes:pdf,doc,docx,txt',
        ]);

        $file = $request->file('file');
        $path = \App\Services\MediaService::upload($file, 'knowledge-documents');

        $doc = KnowledgeDocument::create([
            'organization_id'   => $request->user()->organization_id,
            'file_name'         => $file->getClientOriginalName(),
            'file_path'         => $path,
            'mime_type'         => $file->getMimeType(),
            'size_bytes'        => $file->getSize(),
            'processing_status' => 'pending',
        ]);

        // Process document immediately (could be dispatched to a queue in production)
        $this->knowledgeService->processDocument($doc);
        $doc->refresh();

        return response()->json($doc, 201);
    }

    public function destroyDocument(Request $request, int $id): JsonResponse
    {
        $doc = KnowledgeDocument::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        // Delete the file
        $storagePath = str_replace('/storage/', '', $doc->file_path);
        \Storage::disk('public')->delete($storagePath);

        $doc->delete();

        return response()->json(['message' => 'Deleted']);
    }

    /**
     * AI-extract a draft list of FAQ items from a free-form blob of source
     * text. The admin reviews the result on the frontend, edits if needed,
     * then calls bulkImportFaqs to actually persist.
     */
    public function extractFaqs(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'source_text' => 'required|string|min:50|max:20000',
            'max_items'   => 'nullable|integer|min:1|max:30',
        ]);

        $items = $this->knowledgeService->generateFaqsFromText(
            $validated['source_text'],
            $validated['max_items'] ?? 12
        );

        if (empty($items)) {
            return response()->json([
                'items'   => [],
                'message' => 'AI returned no items. Check the OpenAI key or try a longer source text.',
            ], 200);
        }

        return response()->json(['items' => $items]);
    }

    /**
     * Persist a reviewed batch of FAQ items into the knowledge base.
     */
    public function bulkImportFaqs(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id'        => 'nullable|exists:knowledge_categories,id',
            'items'              => 'required|array|min:1|max:50',
            'items.*.question'   => 'required|string|max:500',
            'items.*.answer'     => 'required|string|max:5000',
            'items.*.keywords'   => 'nullable|array',
            'items.*.keywords.*' => 'string|max:50',
        ]);

        $orgId = $request->user()->organization_id;

        // Make sure a default "AI Generated" category exists if no category was picked.
        $categoryId = $validated['category_id'] ?? null;
        if (!$categoryId) {
            $category = KnowledgeCategory::firstOrCreate(
                ['organization_id' => $orgId, 'name' => 'AI Generated'],
                ['description' => 'FAQ items auto-extracted from source text', 'priority' => 5, 'sort_order' => 0, 'is_active' => true]
            );
            $categoryId = $category->id;
        }

        $created = [];
        foreach ($validated['items'] as $row) {
            $created[] = KnowledgeItem::create([
                'organization_id' => $orgId,
                'category_id'     => $categoryId,
                'question'        => $row['question'],
                'answer'          => $row['answer'],
                'keywords'        => $row['keywords'] ?? [],
                'priority'        => 0,
                'use_count'       => 0,
                'is_active'       => true,
            ]);
        }

        return response()->json([
            'created_count' => count($created),
            'items'         => $created,
        ], 201);
    }

    public function reprocessDocument(Request $request, int $id): JsonResponse
    {
        $doc = KnowledgeDocument::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $this->knowledgeService->processDocument($doc);
        $doc->refresh();

        return response()->json($doc);
    }
}
