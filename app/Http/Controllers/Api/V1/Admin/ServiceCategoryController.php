<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceCategory;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ServiceCategoryController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            ServiceCategory::withCount('services')->orderBy('sort_order')->orderBy('name')->get()
        );
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(ServiceCategory::with('services')->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:200',
            'description' => 'nullable|string|max:1000',
            'icon'        => 'nullable|string|max:50',
            'color'       => 'nullable|string|max:20',
            'image'       => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'nullable|boolean',
        ]);
        unset($data['image']);

        $data['organization_id'] = app('current_organization_id');
        $data['slug'] = Str::slug($data['name']);

        if ($request->hasFile('image')) {
            $data['image'] = MediaService::upload($request->file('image'), 'service-categories');
        }

        return response()->json(ServiceCategory::create($data), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $category = ServiceCategory::findOrFail($id);

        $data = $request->validate([
            'name'        => 'nullable|string|max:200',
            'description' => 'nullable|string|max:1000',
            'icon'        => 'nullable|string|max:50',
            'color'       => 'nullable|string|max:20',
            'image'       => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'nullable|boolean',
        ]);
        unset($data['image']);

        if (!empty($data['name'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        if ($request->hasFile('image')) {
            $data['image'] = MediaService::upload($request->file('image'), 'service-categories');
        }

        $category->update($data);
        return response()->json($category->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        $category = ServiceCategory::findOrFail($id);
        // Detach services from this category instead of cascading delete
        \App\Models\Service::where('category_id', $category->id)->update(['category_id' => null]);
        $category->delete();
        return response()->json(['message' => 'Category deleted']);
    }

    public function reorder(Request $request): JsonResponse
    {
        $items = $request->validate([
            'items'             => 'required|array',
            'items.*.id'        => 'required|integer',
            'items.*.sort_order'=> 'required|integer',
        ])['items'];

        foreach ($items as $item) {
            ServiceCategory::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]);
        }
        return response()->json(['message' => 'Order updated']);
    }
}
