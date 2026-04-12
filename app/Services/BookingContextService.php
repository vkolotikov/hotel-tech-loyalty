<?php

namespace App\Services;

use App\Models\BookingRoom;
use Illuminate\Support\Facades\Cache;

/**
 * Builds booking context for the AI chatbot system prompt.
 * Fetches room catalog and optionally live availability to help
 * the chatbot sell rooms and answer booking questions.
 */
class BookingContextService
{
    public function __construct(private AvailabilityService $availability) {}

    /**
     * Get the room catalog for an organization (cached 10 min).
     * Returns a lightweight array suitable for system prompt injection.
     */
    public function getRoomCatalog(int $orgId): array
    {
        return Cache::remember("booking_ctx:rooms:{$orgId}", 600, function () use ($orgId) {
            $rooms = BookingRoom::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get();

            return $rooms->map(fn($r) => [
                'id'                => $r->pms_id ?: (string) $r->id,
                'name'              => $r->name,
                'short_description' => $r->short_description ?: $r->description,
                'max_guests'        => $r->max_guests,
                'bedrooms'          => $r->bedrooms,
                'bed_type'          => $r->bed_type,
                'size'              => $r->size,
                'base_price'        => (float) $r->base_price,
                'currency'          => $r->currency ?: 'EUR',
                'amenities'         => $r->amenities ?? [],
                'image'             => $r->image,
                'gallery'           => $r->gallery ?? [],
            ])->values()->toArray();
        });
    }

    /**
     * Check live availability for specific dates.
     * Delegates to AvailabilityService and returns available rooms with pricing.
     */
    public function checkAvailability(int $orgId, string $checkIn, string $checkOut, int $adults = 2, int $children = 0): array
    {
        // Bind org context so AvailabilityService scoped queries work
        app()->instance('current_organization_id', $orgId);

        return $this->availability->check($checkIn, $checkOut, $adults, $children);
    }

    /**
     * Build a concise room catalog summary for the AI system prompt.
     * Keeps token count reasonable while giving the AI enough to recommend rooms.
     */
    public function buildRoomCatalogPrompt(int $orgId): string
    {
        $rooms = $this->getRoomCatalog($orgId);
        if (empty($rooms)) return '';

        $baseUrl = rtrim(config('app.url'), '/');

        $lines = ["## Available Rooms & Suites"];
        foreach ($rooms as $room) {
            $amenities = !empty($room['amenities']) ? implode(', ', array_slice($room['amenities'], 0, 6)) : '';
            $lines[] = "- **{$room['name']}** (ID: {$room['id']}): {$room['short_description']}";
            $lines[] = "  Guests: up to {$room['max_guests']} | Bedrooms: {$room['bedrooms']} | Bed: {$room['bed_type']} | Size: {$room['size']}";
            $lines[] = "  From {$room['currency']} {$room['base_price']}/night" . ($amenities ? " | Amenities: {$amenities}" : '');
            if (!empty($room['image'])) {
                $imageUrl = $room['image'];
                if (strpos($imageUrl, 'http') !== 0) {
                    $imageUrl = $baseUrl . (str_starts_with($imageUrl, '/') ? '' : '/') . $imageUrl;
                }
                $lines[] = "  Image: {$imageUrl}";
            }
        }

        return implode("\n", $lines);
    }

    /**
     * Build availability results as AI-readable context.
     */
    public function buildAvailabilityPrompt(array $availableRooms, string $checkIn, string $checkOut): string
    {
        if (empty($availableRooms)) {
            return "\n## Availability Check ({$checkIn} to {$checkOut})\nNo rooms are available for these dates. Suggest the visitor try different dates.";
        }

        $nights = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
        $lines = ["\n## Live Availability ({$checkIn} to {$checkOut}, {$nights} night" . ($nights > 1 ? 's' : '') . ")"];

        foreach ($availableRooms as $room) {
            $lines[] = "- **{$room['name']}** (ID: {$room['id']}): {$room['currency']} {$room['price_per_night']}/night, total {$room['currency']} {$room['total_price']} | Max guests: {$room['max_guests']}";
        }

        return implode("\n", $lines);
    }

    /**
     * Detect if a user message is about booking/rooms/availability.
     */
    public function detectBookingIntent(string $message): array
    {
        $lower = mb_strtolower($message);

        $bookingKeywords = [
            'book', 'booking', 'reserve', 'reservation', 'stay',
            'room', 'suite', 'apartment', 'accommodation',
            'available', 'availability', 'vacant', 'free',
            'price', 'rate', 'cost', 'how much', 'per night',
            'check in', 'check-in', 'checkin', 'check out', 'check-out', 'checkout',
            'night', 'nights', 'date', 'dates', 'calendar',
            'guest', 'guests', 'person', 'people', 'adult', 'child',
            'bed', 'bedroom', 'amenities', 'facilities',
            'upgrade', 'deluxe', 'premium', 'standard', 'luxury',
            'buchen', 'reservieren', 'zimmer', 'verfügbar', 'preis', // German
            'réserver', 'chambre', 'disponible', 'prix', // French
            'забронировать', 'номер', 'свободн', 'цена', // Russian
        ];

        $hasBookingIntent = false;
        foreach ($bookingKeywords as $kw) {
            if (str_contains($lower, $kw)) {
                $hasBookingIntent = true;
                break;
            }
        }

        // Try to extract dates from message (common patterns)
        $dates = $this->extractDates($message);

        // Try to extract guest count
        $guests = $this->extractGuestCount($message);

        return [
            'has_intent'  => $hasBookingIntent,
            'check_in'    => $dates['check_in'] ?? null,
            'check_out'   => $dates['check_out'] ?? null,
            'adults'      => $guests['adults'] ?? null,
            'children'    => $guests['children'] ?? null,
        ];
    }

    /**
     * Try to extract date references from a message.
     */
    private function extractDates(string $message): array
    {
        $dates = [];

        // Match ISO dates: 2026-04-15
        if (preg_match_all('/(\d{4}-\d{2}-\d{2})/', $message, $m)) {
            $found = $m[1];
            if (count($found) >= 2) {
                $dates['check_in'] = $found[0];
                $dates['check_out'] = $found[1];
            } elseif (count($found) === 1) {
                $dates['check_in'] = $found[0];
            }
        }

        // Match European dates: 15/04/2026 or 15.04.2026
        if (empty($dates) && preg_match_all('/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/', $message, $m, PREG_SET_ORDER)) {
            foreach ($m as $i => $match) {
                $d = "{$match[3]}-" . str_pad($match[2], 2, '0', STR_PAD_LEFT) . "-" . str_pad($match[1], 2, '0', STR_PAD_LEFT);
                if ($i === 0) $dates['check_in'] = $d;
                if ($i === 1) $dates['check_out'] = $d;
            }
        }

        return $dates;
    }

    /**
     * Try to extract guest counts from a message.
     */
    private function extractGuestCount(string $message): array
    {
        $result = [];
        $lower = mb_strtolower($message);

        if (preg_match('/(\d+)\s*(?:adult|person|people|guest|erwachsen|adulte|взросл)/i', $lower, $m)) {
            $result['adults'] = min((int) $m[1], 20);
        }
        if (preg_match('/(\d+)\s*(?:child|kid|enfant|ребен|дет)/i', $lower, $m)) {
            $result['children'] = min((int) $m[1], 10);
        }

        return $result;
    }
}
