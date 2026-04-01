<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PropertyAdminController extends Controller
{
    public function index(): JsonResponse
    {
        $properties = Property::withCount('outlets')
            ->orderBy('name')
            ->get();

        return response()->json(['properties' => $properties]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'      => 'required|string|max:255',
            'code'      => 'required|string|max:20|unique:properties,code',
            'address'   => 'nullable|string',
            'city'      => 'nullable|string|max:100',
            'country'   => 'nullable|string|max:100',
            'timezone'  => 'nullable|string|max:50',
            'currency'  => 'nullable|string|max:3',
            'phone'     => 'nullable|string|max:30',
            'email'     => 'nullable|email',
            'image'     => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        // Provide defaults for NOT NULL columns in the DB schema
        $validated['timezone'] = $validated['timezone'] ?? 'UTC';
        $validated['currency'] = $validated['currency'] ?? 'USD';

        // Handle image upload
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('properties', 'public');
            $validated['image_url'] = '/storage/' . $path;
        }
        unset($validated['image']);

        $property = Property::create($validated);

        return response()->json(['message' => 'Property created', 'property' => $property], 201);
    }

    public function show(int $id): JsonResponse
    {
        $property = Property::with('outlets')->findOrFail($id);

        return response()->json(['property' => $property]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $property = Property::findOrFail($id);

        $validated = $request->validate([
            'name'      => 'sometimes|string|max:255',
            'address'   => 'nullable|string',
            'city'      => 'nullable|string|max:100',
            'country'   => 'nullable|string|max:100',
            'timezone'  => 'nullable|string|max:50',
            'currency'  => 'nullable|string|max:3',
            'phone'     => 'nullable|string|max:30',
            'email'     => 'nullable|email',
            'is_active' => 'sometimes|boolean',
            'image'     => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        // Handle image upload
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('properties', 'public');
            $validated['image_url'] = '/storage/' . $path;
        }
        unset($validated['image']);

        $property->update($validated);

        return response()->json(['message' => 'Property updated', 'property' => $property]);
    }

    // ─── Outlets ─────────────────────────────────────────────────────────────

    public function outlets(int $propertyId): JsonResponse
    {
        $outlets = Outlet::where('property_id', $propertyId)->orderBy('name')->get();

        return response()->json(['outlets' => $outlets]);
    }

    public function storeOutlet(Request $request, int $propertyId): JsonResponse
    {
        $validated = $request->validate([
            'name'               => 'required|string|max:255',
            'code'               => 'nullable|string|max:20',
            'type'               => 'required|in:restaurant,bar,spa,gym,pool,lounge,shop,room_service,minibar,other',
            'earn_rate_override'  => 'nullable|numeric|min:0',
        ]);

        $validated['property_id'] = $propertyId;

        // Auto-generate a code if not provided
        if (empty($validated['code'])) {
            $typePrefix = strtoupper(substr($validated['type'], 0, 4));
            $nextNum = Outlet::where('property_id', $propertyId)->count() + 1;
            $validated['code'] = $typePrefix . str_pad($nextNum, 2, '0', STR_PAD_LEFT);
        }

        $outlet = Outlet::create($validated);

        return response()->json(['message' => 'Outlet created', 'outlet' => $outlet], 201);
    }

    public function updateOutlet(Request $request, int $propertyId, int $outletId): JsonResponse
    {
        $outlet = Outlet::where('property_id', $propertyId)->findOrFail($outletId);

        $validated = $request->validate([
            'name'               => 'sometimes|string|max:255',
            'type'               => 'sometimes|in:restaurant,bar,spa,gym,pool,lounge,shop,room_service,minibar,other',
            'earn_rate_override'  => 'nullable|numeric|min:0',
            'is_active'          => 'sometimes|boolean',
        ]);

        $outlet->update($validated);

        return response()->json(['message' => 'Outlet updated', 'outlet' => $outlet]);
    }
}
