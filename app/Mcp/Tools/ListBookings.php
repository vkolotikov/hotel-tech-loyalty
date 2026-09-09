<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class ListBookings extends HexaTechTool
{
    protected string $name = 'list_bookings';

    protected string $title = 'List HexaTech bookings';

    protected string $description = 'List bookings starting in an inclusive date range (up to 90 days), defaulting to today through 30 days ahead in the organization timezone. Choose room for the room/PMS booking calendar, reservation for CRM hotel reservations, or service for appointments. These are separate collections; do not add their totals as if they were unique bookings. A null currency is unknown: do not assume a currency for that amount. Optional query searches references, and customer names/emails for room/service or room numbers for reservation. Results include cancelled records and current status. Follow next_page while present. If results_truncated is true, the page limit was reached: narrow the date range or query, or restart with a larger limit. Never present truncated results as complete.';

    protected array $rules = ['kind' => 'required|in:room,reservation,service',
        'from' => 'sometimes|filled|date_format:Y-m-d', 'to' => 'sometimes|filled|date_format:Y-m-d',
        'query' => 'sometimes|filled|string|min:2|max:120|regex:/\S/u',
        'limit' => 'sometimes|filled|integer|min:1|max:50',
        'page' => 'sometimes|filled|integer|min:1|max:'.CustomerBookingAccess::MAX_BOOKING_PAGE];

    public function schema(JsonSchema $schema): array
    {
        return ['kind' => $schema->string()->enum(['room', 'reservation', 'service'])->required(),
            'from' => $schema->string()->format('date'), 'to' => $schema->string()->format('date'),
            'query' => $schema->string()->min(2)->max(120),
            'limit' => $schema->integer()->min(1)->max(50)->default(20),
            'page' => $schema->integer()->min(1)->max(CustomerBookingAccess::MAX_BOOKING_PAGE)->default(1)];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return $access->listBookings($data);
    }
}
