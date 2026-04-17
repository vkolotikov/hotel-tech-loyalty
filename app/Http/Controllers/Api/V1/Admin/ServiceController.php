<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ServiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Service::with(['category:id,name,color,icon', 'masters:id,name,avatar'])
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($categoryId = $request->input('category_id')) {
            $query->where('category_id', $categoryId);
        }
        if ($search = $request->input('search')) {
            $query->where('name', 'ilike', "%{$search}%");
        }

        return response()->json($query->get());
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(
            Service::with(['category', 'masters'])->findOrFail($id)
        );
    }

    public function store(Request $request): JsonResponse
    {
        // Decode JSON-stringified arrays from FormData BEFORE validation
        foreach (['gallery', 'tags', 'master_ids'] as $jsonField) {
            if ($request->has($jsonField) && is_string($request->input($jsonField))) {
                $decoded = json_decode($request->input($jsonField), true);
                if (is_array($decoded)) $request->merge([$jsonField => $decoded]);
            }
        }

        $data = $request->validate([
            'category_id'          => 'nullable|integer|exists:service_categories,id',
            'name'                 => 'required|string|max:200',
            'description'          => 'nullable|string|max:5000',
            'short_description'    => 'nullable|string|max:500',
            'duration_minutes'     => 'required|integer|min:5|max:1440',
            'buffer_after_minutes' => 'nullable|integer|min:0|max:240',
            'price'                => 'nullable|numeric|min:0',
            'currency'             => 'nullable|string|max:10',
            'image'                => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'tags'                 => 'nullable|array',
            'sort_order'           => 'nullable|integer',
            'is_active'            => 'nullable|boolean',
            'master_ids'           => 'nullable|array',
            'master_ids.*'         => 'integer|exists:service_masters,id',
        ]);

        $masterIds = $data['master_ids'] ?? [];
        unset($data['image'], $data['master_ids']);

        $data['organization_id'] = app('current_organization_id');
        $data['slug'] = Str::slug($data['name']);

        if ($request->hasFile('image')) {
            $data['image'] = MediaService::upload($request->file('image'), 'services');
        }

        if ($request->hasFile('gallery_files')) {
            $gallery = [];
            foreach ($request->file('gallery_files') as $file) {
                $gallery[] = MediaService::upload($file, 'services');
            }
            $data['gallery'] = $gallery;
        }

        $service = Service::create($data);
        if (!empty($masterIds)) {
            $this->syncMasters($service, $masterIds);
        }

        return response()->json($service->load(['category', 'masters']), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $service = Service::findOrFail($id);

        foreach (['gallery', 'tags', 'master_ids'] as $jsonField) {
            if ($request->has($jsonField) && is_string($request->input($jsonField))) {
                $decoded = json_decode($request->input($jsonField), true);
                if (is_array($decoded)) $request->merge([$jsonField => $decoded]);
            }
        }

        $data = $request->validate([
            'category_id'          => 'nullable|integer|exists:service_categories,id',
            'name'                 => 'nullable|string|max:200',
            'description'          => 'nullable|string|max:5000',
            'short_description'    => 'nullable|string|max:500',
            'duration_minutes'     => 'nullable|integer|min:5|max:1440',
            'buffer_after_minutes' => 'nullable|integer|min:0|max:240',
            'price'                => 'nullable|numeric|min:0',
            'currency'             => 'nullable|string|max:10',
            'image'                => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'tags'                 => 'nullable|array',
            'sort_order'           => 'nullable|integer',
            'is_active'            => 'nullable|boolean',
            'master_ids'           => 'nullable|array',
            'master_ids.*'         => 'integer|exists:service_masters,id',
        ]);

        $masterIds = $data['master_ids'] ?? null;
        unset($data['image'], $data['master_ids']);

        if (!empty($data['name'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        if ($request->hasFile('image')) {
            $data['image'] = MediaService::upload($request->file('image'), 'services');
        }

        if ($request->hasFile('gallery_files')) {
            $gallery = $service->gallery ?? [];
            foreach ($request->file('gallery_files') as $file) {
                $gallery[] = MediaService::upload($file, 'services');
            }
            $data['gallery'] = $gallery;
        }

        $service->update($data);

        if ($masterIds !== null) {
            $this->syncMasters($service, $masterIds);
        }

        return response()->json($service->fresh(['category', 'masters']));
    }

    public function destroy(int $id): JsonResponse
    {
        $service = Service::findOrFail($id);
        $service->masters()->detach();
        $service->delete();
        return response()->json(['message' => 'Service deleted']);
    }

    public function removeGallery(Request $request, int $id): JsonResponse
    {
        $service = Service::findOrFail($id);
        $url = $request->input('url');
        $gallery = $service->gallery ?? [];
        $gallery = array_values(array_filter($gallery, fn($img) => $img !== $url));
        $service->update(['gallery' => $gallery]);
        return response()->json($service->fresh());
    }

    public function reorder(Request $request): JsonResponse
    {
        $items = $request->validate([
            'items'              => 'required|array',
            'items.*.id'         => 'required|integer',
            'items.*.sort_order' => 'required|integer',
        ])['items'];

        foreach ($items as $item) {
            Service::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]);
        }
        return response()->json(['message' => 'Order updated']);
    }

    private function syncMasters(Service $service, array $masterIds): void
    {
        $orgId = app('current_organization_id');
        $sync = [];
        foreach ($masterIds as $mid) {
            $sync[(int) $mid] = ['organization_id' => $orgId];
        }
        $service->masters()->sync($sync);
    }
}
