<?php

namespace App\Mcp\Tools\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\VoiceTool;
use App\Models\User;
use App\Voice\NoteProposal;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Validation\ValidationException;

class VoiceCommitNote extends VoiceTool
{
    protected bool $requiresWrite = true;

    protected bool $readOnly = false;

    protected string $name = 'voice_commit_note';

    protected string $title = 'Save a proposed note';

    protected string $description = 'Save the note that voice_propose_note prepared, using its request_id. Call this only after the user has confirmed the read_back sentence. The saved text is the text stored at proposal time; it cannot be changed here. A request_id works once, so a repeated confirmation saves nothing further.';

    protected array $rules = [
        'request_id' => 'required|uuid',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'request_id' => $schema->string()->format('uuid')->required()
                ->description('The request_id returned by voice_propose_note.'),
        ];
    }

    protected function speak(array $data, CustomerBookingAccess $access, User $staff): array
    {
        $proposal = app(NoteProposal::class)->claim((int) $staff->id, $data['request_id']);

        if ($proposal === null) {
            throw ValidationException::withMessages(['request_id' =>
                'That note was not waiting to be saved, or it has already been saved. Propose it again.']);
        }

        // The stored text is written, never anything supplied at commit time,
        // so the sentence read back to the user is the sentence that is saved.
        if ($proposal['subject_type'] === 'customer') {
            $access->addCustomerNote((int) $proposal['subject_id'], $proposal['body'], $data['request_id']);
        } else {
            [$kind, $id] = explode(':', $proposal['subject_id'], 2);
            $access->addBookingNote($kind, (int) $id, $proposal['body'], $data['request_id']);
        }

        return [
            'saved' => true,
            'spoken_result' => 'Saved.',
        ];
    }
}
