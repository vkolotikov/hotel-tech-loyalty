<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class AddBookingNote extends HexaTechTool
{
    protected string $name = 'add_booking_note';

    protected string $title = 'Add an internal booking note';

    protected string $description = 'Append an internal staff note to the exact booking kind and ID selected using list_bookings/get_booking, after the user asks to save that note. Existing notes are preserved. Does not change dates, status, prices, availability, payments or the external PMS and sends no customer notification. Generate a UUID request_id per intended note; reuse the same target, text and UUID on retries.';

    protected bool $readOnly = false;

    protected array $rules = ['kind' => 'required|in:room,reservation,service', 'booking_id' => 'required|integer|min:1',
        'body' => 'required|string|min:1|max:2000|regex:/\S/u', 'request_id' => 'required|uuid'];

    public function schema(JsonSchema $schema): array
    {
        return ['kind' => $schema->string()->enum(['room', 'reservation', 'service'])->required(),
            'booking_id' => $schema->integer()->min(1)->required(),
            'body' => $schema->string()->min(1)->max(2000)->required(),
            'request_id' => $schema->string()->format('uuid')->required()];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return $access->addBookingNote($data['kind'], $data['booking_id'], $data['body'], $data['request_id']);
    }
}
