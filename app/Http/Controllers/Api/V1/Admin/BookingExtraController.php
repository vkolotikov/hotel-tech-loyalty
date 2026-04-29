<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingExtra;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

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
            // Hotel needs at least this many hours' notice before check-in
            // before this extra can be added. 0 = available up to the
            // moment of booking; 168 (one week) is the upper bound to
            // catch obvious mistakes.
            'lead_time_hours' => 'nullable|integer|min:0|max:168',
            'currency'    => 'nullable|string|max:10',
            // mimes/max validated explicitly so we get a clear 422 instead of a
            // silent server-side failure deep inside MediaService.
            'image'       => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'icon'        => 'nullable|string|max:50',
            'category'    => 'nullable|string|max:50',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'nullable|boolean',
        ]);
        // validate() returns the validated payload but we don't want the
        // UploadedFile leaking into the model array.
        unset($data['image']);

        $data['organization_id'] = app('current_organization_id');

        if ($request->hasFile('image')) {
            try {
                $data['image'] = MediaService::upload($request->file('image'), 'booking-extras');
            } catch (\Throwable $e) {
                Log::error('BookingExtra image upload failed', ['error' => $e->getMessage()]);
                return response()->json(['error' => 'Image upload failed: ' . $e->getMessage()], 500);
            }
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
            // Hotel needs at least this many hours' notice before check-in
            // before this extra can be added. 0 = available up to the
            // moment of booking; 168 (one week) is the upper bound to
            // catch obvious mistakes.
            'lead_time_hours' => 'nullable|integer|min:0|max:168',
            'currency'    => 'nullable|string|max:10',
            'image'       => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'icon'        => 'nullable|string|max:50',
            'category'    => 'nullable|string|max:50',
            'sort_order'  => 'nullable|integer',
            'is_active'   => 'nullable|boolean',
        ]);
        unset($data['image']);

        if ($request->hasFile('image')) {
            try {
                $data['image'] = MediaService::upload($request->file('image'), 'booking-extras');
            } catch (\Throwable $e) {
                Log::error('BookingExtra image upload failed', ['extra_id' => $id, 'error' => $e->getMessage()]);
                return response()->json(['error' => 'Image upload failed: ' . $e->getMessage()], 500);
            }
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
