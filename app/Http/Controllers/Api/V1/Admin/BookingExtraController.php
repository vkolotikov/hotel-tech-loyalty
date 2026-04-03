<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingExtra;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingExtraController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(BookingExtra::orderBy('sort_order')->orderBy('name')->get());
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(BookingExtra::findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:200',
            'description' => 'nullable|string|max:1000',
            'price'       => 'nullable|numeric|min:0',
            'price_type'  => 'nullable|string|in:per_stay,per_night,per_person,per_person_night',
            'currency'    => 'nullable|string|max:10',
            'icon'        => 'nullable|string|max:50',
            'category'    => 'nullable|string|max:50',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'nullable|boolean',
        ]);

        $data['organization_id'] = app('current_organization_id');

        if ($request->hasFile('image')) {
            $data['image'] = \App\Services\MediaService::upload($request->file('image'), 'booking-extras');
        }

        return response()->json(BookingExtra::create($data), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $extra = BookingExtra::findOrFail($id);

        $data = $request->validate([
            'name'        => 'nullable|string|max:200',
            'description' => 'nullable|string|max:1000',
            'price'       => 'nullable|numeric|min:0',
            'price_type'  => 'nullable|string|in:per_stay,per_night,per_person,per_person_night',
            'currency'    => 'nullable|string|max:10',
            'icon'        => 'nullable|string|max:50',
            'category'    => 'nullable|string|max:50',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'nullable|boolean',
        ]);

        if ($request->hasFile('image')) {
            $data['image'] = \App\Services\MediaService::upload($request->file('image'), 'booking-extras');
        }

        $extra->update($data);
        return response()->json($extra->fresh());
    }

    public function destroy(int $id): JsonResponse
    {
        BookingExtra::findOrFail($id)->delete();
        return response()->json(['message' => 'Extra deleted']);
    }
}
