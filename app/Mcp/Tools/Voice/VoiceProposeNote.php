<?php

namespace App\Mcp\Tools\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\VoiceTool;
use App\Models\User;
use App\Voice\NoteProposal;
use App\Voice\SpeakableRenderer;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class VoiceProposeNote extends VoiceTool
{
    protected bool $requiresWrite = true;

    protected bool $readOnly = false;

    protected string $name = 'voice_propose_note';

    protected string $title = 'Propose a note for confirmation';

    protected string $description = 'Prepare a note on a customer or booking and return a read_back sentence plus a request_id. This does NOT save anything. Read read_back to the user word for word, then call voice_commit_note with the same request_id only after the user confirms. For a booking, subject_id is the kind and id joined by a colon, such as "service:1".';

    protected array $rules = [
        'subject_type' => 'required|in:customer,booking',
        // Array form, not a pipe string: the alternation in this pattern would
        // otherwise be split into separate rules and break preg_match.
        'subject_id' => ['required', 'filled', 'string', 'max:40',
            'regex:/^(room:|reservation:|service:)?\d+$/'],
        'body' => 'required|filled|string|min:2|max:2000|regex:/\S/u',
    ];

    protected array $messages = [
        'subject_id.regex' => 'Use a customer id, or "<kind>:<id>" for a booking, such as "service:1".',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'subject_type' => $schema->string()->enum(['customer', 'booking'])->required(),
            'subject_id' => $schema->string()->max(40)->required()
                ->description('Customer id, or "<kind>:<id>" for a booking, such as "service:1".'),
            'body' => $schema->string()->min(2)->max(2000)->required()
                ->description('The note exactly as the user said it.'),
        ];
    }

    protected function speak(array $data, CustomerBookingAccess $access, User $staff): array
    {
        $renderer = $this->renderer($staff);
        $subject = $this->describeSubject($data, $access, $renderer);

        $requestId = app(NoteProposal::class)
            ->issue((int) $staff->id, $data['subject_type'], $data['subject_id'], $data['body']);

        return [
            'request_id' => $requestId,
            'read_back' => 'I will add the note "'.$data['body'].'" to '.$subject.'. Shall I save it?',
            'subject_type' => $data['subject_type'],
            'subject_id' => $data['subject_id'],
            'saved' => false,
        ];
    }

    /** Resolving here proves the record exists and is permitted before any read-back. */
    private function describeSubject(array $data, CustomerBookingAccess $access, SpeakableRenderer $renderer): string
    {
        if ($data['subject_type'] === 'customer') {
            $customer = $access->getCustomer((int) $data['subject_id'])['customer'];

            return $renderer->personName($customer['full_name'] ?? null);
        }

        if (! str_contains($data['subject_id'], ':')) {
            throw new \InvalidArgumentException('A booking needs its kind, as in "service:1".');
        }

        [$kind, $id] = explode(':', $data['subject_id'], 2);
        $booking = $access->getBooking($kind, (int) $id)['booking'];
        $name = $renderer->personName($booking['customer_name'] ?? null);

        return "the {$kind} booking for ".$name;
    }
}
