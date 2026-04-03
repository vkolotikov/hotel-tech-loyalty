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

    public function reprocessDocument(Request $request, int $id): JsonResponse
    {
        $doc = KnowledgeDocument::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $this->knowledgeService->processDocument($doc);
        $doc->refresh();

        return response()->json($doc);
    }
}
