<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceExtra;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceExtraController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            ServiceExtra::orderBy('sort_order')->orderBy('name')->get()
        );
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(ServiceExtra::findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'             => 'required|string|max:200',
            'description'      => 'nullable|string|max:1000',
            'price'            => 'nullable|numeric|min:0',
            'price_type'       => 'nullable|string|in:per_booking,per_person',
            'duration_minutes' => 'nullable|integer|min:0|max:240',
            // Hotel needs at least this many hours' notice before the
            // service starts before this extra can be added. 0 = no
            // restriction; 168 (one week) is the upper bound.
            'lead_time_hours'  => 'nullable|integer|min:0|max:168',
            'currency'         => 'nullable|string|max:10',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'icon'             => 'nullable|string|max:50',
            'category'         => 'nullable|string|max:50',
            'sort_order'       => 'nullable|integer',
            'is_active'        => 'nullable|boolean',
        ]);
        unset($data['image']);
        $data = self::withoutEmptyRequired($data);

        $data['organization_id'] = app('current_organization_id');

        if ($request->hasFile('image')) {
            $data['image'] = MediaService::upload($request->file('image'), 'service-extras');
        }

        return response()->json(ServiceExtra::create($data), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $extra = ServiceExtra::findOrFail($id);

        $data = $request->validate([
            'name'             => 'nullable|string|max:200',
            'description'      => 'nullable|string|max:1000',
            'price'            => 'nullable|numeric|min:0',
            'price_type'       => 'nullable|string|in:per_booking,per_person',
            'duration_minutes' => 'nullable|integer|min:0|max:240',
            // Hotel needs at least this many hours' notice before the
            // service starts before this extra can be added. 0 = no
            // restriction; 168 (one week) is the upper bound.
            'lead_time_hours'  => 'nullable|integer|min:0|max:168',
            'currency'         => 'nullable|string|max:10',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'icon'             => 'nullable|string|max:50',
            'category'         => 'nullable|string|max:50',
            'sort_order'       => 'nullable|integer',
            'is_active'        => 'nullable|boolean',
        ]);
        unset($data['image']);
        $data = self::withoutEmptyRequired($data);

        if ($request->hasFile('image')) {
            $data['image'] = MediaService::upload($request->file('image'), 'service-extras');
        }

        $extra->update($data);
        return response()->json($extra->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        ServiceExtra::findOrFail($id)->delete();
        return response()->json(['message' => 'Extra deleted']);
    }

    /**
     * A field sent empty (null) keeps the stored value — or, for a new extra, its column's default: every column but
     * these is NOT NULL (lead time 0 = no notice needed, price 0, …), so writing null is a database error.
     */
    private static function withoutEmptyRequired(array $data): array
    {
        return array_filter($data, fn ($value, string $field) => $value !== null || in_array($field, ['description', 'icon', 'category'], true), ARRAY_FILTER_USE_BOTH);
    }
}
