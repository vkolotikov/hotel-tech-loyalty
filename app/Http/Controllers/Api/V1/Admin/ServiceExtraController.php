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
            'currency'         => 'nullable|string|max:10',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'icon'             => 'nullable|string|max:50',
            'category'         => 'nullable|string|max:50',
            'sort_order'       => 'nullable|integer',
            'is_active'        => 'nullable|boolean',
        ]);
        unset($data['image']);

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
            'currency'         => 'nullable|string|max:10',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'icon'             => 'nullable|string|max:50',
            'category'         => 'nullable|string|max:50',
            'sort_order'       => 'nullable|integer',
            'is_active'        => 'nullable|boolean',
        ]);
        unset($data['image']);

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
}
