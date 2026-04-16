<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingRoom;
use App\Models\AuditLog;
use App\Services\PmsResolver;
use App\Services\SmoobuClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BookingRoomController extends Controller
{
    /** GET /v1/admin/booking-rooms — list all rooms. */
    public function index(): JsonResponse
    {
        $rooms = BookingRoom::orderBy('sort_order')->orderBy('name')->get();
        return response()->json($rooms);
    }

    /** GET /v1/admin/booking-rooms/{id} — single room. */
    public function show(int $id): JsonResponse
    {
        $room = BookingRoom::findOrFail($id);
        return response()->json($room);
    }

    /** POST /v1/admin/booking-rooms — create room. */
    public function store(Request $request): JsonResponse
    {
        // Decode JSON-stringified arrays from FormData BEFORE validation
        foreach (['amenities', 'tags'] as $jsonField) {
            if ($request->has($jsonField) && is_string($request->input($jsonField))) {
                $decoded = json_decode($request->input($jsonField), true);
                if (is_array($decoded)) $request->merge([$jsonField => $decoded]);
            }
        }

        $data = $request->validate([
            'name'              => 'required|string|max:200',
            'description'       => 'nullable|string|max:2000',
            'short_description' => 'nullable|string|max:500',
            'max_guests'        => 'nullable|integer|min:1|max:50',
            'bedrooms'          => 'nullable|integer|min:0|max:20',
            'bed_type'          => 'nullable|string|max:50',
            'base_price'        => 'nullable|numeric|min:0',
            'inventory_count'   => 'nullable|integer|min:1|max:9999',
            'currency'          => 'nullable|string|max:10',
            'size'              => 'nullable|string|max:50',
            'amenities'         => 'nullable|array',
            'tags'              => 'nullable|array',
            'sort_order'        => 'nullable|integer',
            'is_active'         => 'nullable|boolean',
            'pms_id'            => 'nullable|string|max:100',
        ]);

        $data['organization_id'] = app('current_organization_id');
        $data['slug'] = Str::slug($data['name']);

        // Handle image upload
        if ($request->hasFile('image')) {
            $data['image'] = \App\Services\MediaService::upload($request->file('image'), 'booking-rooms');
        }

        // Handle gallery uploads
        if ($request->hasFile('gallery_files')) {
            $gallery = [];
            foreach ($request->file('gallery_files') as $file) {
                $gallery[] = \App\Services\MediaService::upload($file, 'booking-rooms');
            }
            $data['gallery'] = $gallery;
        }

        $room = BookingRoom::create($data);

        AuditLog::create([
            'organization_id' => $data['organization_id'],
            'user_id' => $request->user()?->id,
            'action' => 'booking_room.created',
            'description' => "Created room: {$room->name}",
        ]);

        return response()->json($room, 201);
    }

    /** POST /v1/admin/booking-rooms/{id} — update room (use POST with _method=PUT for file upload). */
    public function update(Request $request, int $id): JsonResponse
    {
        $room = BookingRoom::findOrFail($id);

        // Decode JSON-stringified arrays from FormData BEFORE validation
        foreach (['amenities', 'tags'] as $jsonField) {
            if ($request->has($jsonField) && is_string($request->input($jsonField))) {
                $decoded = json_decode($request->input($jsonField), true);
                if (is_array($decoded)) $request->merge([$jsonField => $decoded]);
            }
        }

        $data = $request->validate([
            'name'              => 'nullable|string|max:200',
            'description'       => 'nullable|string|max:2000',
            'short_description' => 'nullable|string|max:500',
            'max_guests'        => 'nullable|integer|min:1|max:50',
            'bedrooms'          => 'nullable|integer|min:0|max:20',
            'bed_type'          => 'nullable|string|max:50',
            'base_price'        => 'nullable|numeric|min:0',
            'inventory_count'   => 'nullable|integer|min:1|max:9999',
            'currency'          => 'nullable|string|max:10',
            'size'              => 'nullable|string|max:50',
            'amenities'         => 'nullable|array',
            'tags'              => 'nullable|array',
            'sort_order'        => 'nullable|integer',
            'is_active'         => 'nullable|boolean',
            'pms_id'            => 'nullable|string|max:100',
        ]);

        if (isset($data['name'])) {
            $data['slug'] = Str::slug($data['name']);
        }

        if ($request->hasFile('image')) {
            $data['image'] = \App\Services\MediaService::upload($request->file('image'), 'booking-rooms');
        }

        if ($request->hasFile('gallery_files')) {
            $gallery = $room->gallery ?? [];
            foreach ($request->file('gallery_files') as $file) {
                $gallery[] = \App\Services\MediaService::upload($file, 'booking-rooms');
            }
            $data['gallery'] = $gallery;
        }

        $room->update($data);

        return response()->json($room->fresh());
    }

    /** DELETE /v1/admin/booking-rooms/{id} */
    public function destroy(int $id): JsonResponse
    {
        $room = BookingRoom::findOrFail($id);
        $room->delete();
        return response()->json(['message' => 'Room deleted']);
    }

    /** POST /v1/admin/booking-rooms/{id}/remove-gallery — remove a gallery image. */
    public function removeGallery(Request $request, int $id): JsonResponse
    {
        $room = BookingRoom::findOrFail($id);
        $url = $request->input('url');
        $gallery = $room->gallery ?? [];
        $gallery = array_values(array_filter($gallery, fn($img) => $img !== $url));
        $room->update(['gallery' => $gallery]);
        return response()->json($room->fresh());
    }

    /** POST /v1/admin/booking-rooms/sync — pull rooms from the active PMS and upsert into booking_rooms table. */
    public function sync(SmoobuClient $smoobu, PmsResolver $pms): JsonResponse
    {
        $orgId = app('current_organization_id');
        $activePms = $pms->activePms();

        // No PMS configured at all
        if (!$activePms) {
            return response()->json([
                'message' => 'No PMS integration configured. Connect a PMS provider in Settings → Integrations to sync rooms.',
                'synced' => 0, 'created' => 0, 'updated' => 0,
            ], 422);
        }

        // PMS is configured but doesn't have sync support yet
        if (!$activePms['syncable']) {
            return response()->json([
                'message' => "{$activePms['name']} is connected but room sync is not yet supported for this provider. You can add rooms manually.",
                'synced' => 0, 'created' => 0, 'updated' => 0,
                'provider' => $activePms['name'],
            ], 422);
        }

        // Smoobu is the active syncable provider — verify client is live
        if ($activePms['id'] === 'smoobu' && $smoobu->isMock()) {
            return response()->json([
                'message' => 'Smoobu API key is missing or invalid. Check your credentials in Settings → Integrations.',
                'synced' => 0, 'created' => 0, 'updated' => 0,
            ], 422);
        }

        try {
            $response = $smoobu->getApartments();
            $apartments = $response['apartments'] ?? [];

            if (empty($apartments)) {
                return response()->json(['message' => "No apartments found in {$activePms['name']}.", 'synced' => 0, 'created' => 0, 'updated' => 0]);
            }

            // Fetch current rates to get real prices (Smoobu apartments don't include prices)
            $pmsIds = array_map(fn($a) => (string) ($a['id'] ?? ''), $apartments);
            $pmsIds = array_filter($pmsIds);
            $ratesByUnit = [];
            try {
                $checkIn = now()->format('Y-m-d');
                $checkOut = now()->addDay()->format('Y-m-d');
                $ratesResponse = $smoobu->getRates($checkIn, $checkOut, $pmsIds);
                $ratesData = $ratesResponse['data'] ?? $ratesResponse;
                foreach ($ratesData as $unitId => $rate) {
                    $ratesByUnit[(string) $unitId] = (float) ($rate['price_per_night'] ?? $rate['price'] ?? 0);
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Rate fetch during sync failed', ['error' => $e->getMessage()]);
            }

            $created = 0;
            $updated = 0;

            foreach ($apartments as $apt) {
                $pmsId = (string) ($apt['id'] ?? '');
                if (!$pmsId) continue;

                $rooms = $apt['rooms'] ?? [];
                $ratePrice = $ratesByUnit[$pmsId] ?? 0;

                $existing = BookingRoom::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('pms_id', $pmsId)
                    ->first();

                if ($existing) {
                    $updateData = [
                        'name' => $existing->name ?: ($apt['name'] ?? "Unit {$pmsId}"),
                        'max_guests' => $rooms['maxOccupancy'] ?? $apt['maxOccupancy'] ?? $existing->max_guests,
                        'bedrooms' => $rooms['bedrooms'] ?? $existing->bedrooms,
                        'meta' => array_merge($existing->meta ?? [], ['pms_raw' => $apt]),
                    ];
                    if ($ratePrice > 0) {
                        $updateData['base_price'] = $ratePrice;
                    }
                    $existing->update($updateData);
                    $updated++;
                } else {
                    BookingRoom::withoutGlobalScopes()->create([
                        'organization_id' => $orgId,
                        'pms_id' => $pmsId,
                        'name' => $apt['name'] ?? "Unit {$pmsId}",
                        'slug' => Str::slug($apt['name'] ?? "unit-{$pmsId}"),
                        'description' => $apt['description'] ?? '',
                        'max_guests' => $rooms['maxOccupancy'] ?? $apt['maxOccupancy'] ?? 4,
                        'bedrooms' => $rooms['bedrooms'] ?? 1,
                        'base_price' => $ratePrice > 0 ? $ratePrice : 100,
                        'image' => $apt['imageUrl'] ?? $apt['mainImage'] ?? '',
                        'meta' => ['pms_raw' => $apt],
                    ]);
                    $created++;
                }
            }

            AuditLog::create([
                'organization_id' => $orgId,
                'user_id' => request()->user()?->id,
                'action' => 'booking_rooms.synced',
                'description' => "Synced rooms from {$activePms['name']}: {$created} created, {$updated} updated",
            ]);

            return response()->json([
                'message' => "Synced {$created} new rooms, updated {$updated} existing from {$activePms['name']}.",
                'synced' => $created + $updated,
                'created' => $created,
                'updated' => $updated,
                'provider' => $activePms['name'],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => "Sync from {$activePms['name']} failed: " . $e->getMessage()], 500);
        }
    }

    /** POST /v1/admin/booking-rooms/reorder — update sort order. */
    public function reorder(Request $request): JsonResponse
    {
        $items = $request->validate(['items' => 'required|array', 'items.*.id' => 'required|integer', 'items.*.sort_order' => 'required|integer'])['items'];
        foreach ($items as $item) {
            // TenantScope on the model ensures only this org's rooms are updated
            BookingRoom::where('id', $item['id'])->update(['sort_order' => $item['sort_order']]);
        }
        return response()->json(['message' => 'Order updated']);
    }
}
