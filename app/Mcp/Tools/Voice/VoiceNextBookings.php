<?php

namespace App\Mcp\Tools\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\VoiceTool;
use App\Models\User;
use App\Voice\SpeakableRenderer;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class VoiceNextBookings extends VoiceTool
{
    /** A spoken list longer than this stops being listenable. */
    private const SPOKEN_LIMIT = 3;

    protected string $name = 'voice_next_bookings';

    protected string $title = 'Read the next bookings aloud';

    protected string $description = 'List the next bookings of one kind on a given day for a spoken answer. Omit the date for today and the kind for service appointments. Returns at most three bookings with the customer named by first name and last initial. Speak spoken_summary as returned. Amounts, payment status and contact details are deliberately absent; if the user wants a price, tell them it is in the portal.';

    protected array $rules = [
        'kind' => 'sometimes|filled|in:room,reservation,service',
        'date' => 'sometimes|filled|date_format:Y-m-d',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'kind' => $schema->string()->enum(['room', 'reservation', 'service'])->default('service')
                ->description('Booking collection to read; service appointments by default.'),
            'date' => $schema->string()->format('date')->description('The day in the organization timezone; omit for today.'),
        ];
    }

    protected function speak(array $data, CustomerBookingAccess $access, User $staff): array
    {
        $date = $data['date'] ?? null;
        $kind = $data['kind'] ?? 'service';
        $result = $access->listBookings(array_filter([
            'kind' => $kind,
            'from' => $date,
            'to' => $date,
            'limit' => self::SPOKEN_LIMIT + 1,
        ]));

        $renderer = $this->renderer($staff);
        $counted = $this->countBookings($result);
        $spoken = [];
        $bookings = [];

        // Select the fields to speak rather than subtracting the ones not to.
        // The booking row carries total_amount, currency and payment_status;
        // spreading it would read money aloud and would silently carry any
        // field added to that payload later.
        foreach (array_slice($result['bookings'], 0, self::SPOKEN_LIMIT) as $booking) {
            $name = $renderer->personName($booking['customer_name'] ?? null);
            $bookings[] = $renderer->redactContact([
                'id' => $booking['id'] ?? null,
                'kind' => $booking['kind'] ?? $kind,
                'start' => $booking['start'] ?? null,
                'status' => $booking['status'] ?? null,
                'spoken_name' => $name,
            ]);
            $spoken[] = $name;
        }

        return [
            'spoken_summary' => $this->summarize($counted, $spoken, $renderer),
            'bookings' => $bookings,
            'count_is_partial' => $counted['at_least'],
            'date' => $result['from'],
        ];
    }

    private function summarize(array $counted, array $names, SpeakableRenderer $renderer): string
    {
        if ($names === []) {
            return 'Nothing is booked.';
        }

        $total = $this->spokenBookingCount($counted, $renderer, 'booking', 'bookings');

        return count($names) < $counted['count'] || $counted['at_least']
            ? ucfirst($total).'. The next are '.implode(', ', $names).'.'
            : ucfirst($total).': '.implode(', ', $names).'.';
    }
}
