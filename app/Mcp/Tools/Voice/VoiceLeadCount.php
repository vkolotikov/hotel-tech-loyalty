<?php

namespace App\Mcp\Tools\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\VoiceTool;
use App\Models\User;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class VoiceLeadCount extends VoiceTool
{
    protected string $name = 'voice_lead_count';

    protected string $title = 'Count CRM leads for speech';

    protected string $description = 'Count CRM leads created on one calendar day in the organization timezone, for a spoken answer. Omit the date for today. Returns spoken_count, which is already worded for speech, alongside the numeric count. Speak spoken_count as given; do not restate it as digits.';

    protected array $rules = [
        'date' => 'sometimes|filled|date_format:Y-m-d',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'date' => $schema->string()->format('date')->description('Creation date in the organization timezone; omit for today.'),
        ];
    }

    protected function speak(array $data, CustomerBookingAccess $access, User $staff): array
    {
        $leads = $access->listLeads(array_filter([
            'from' => $data['date'] ?? null,
            'to' => $data['date'] ?? null,
            'limit' => 1,
        ]));

        $renderer = $this->renderer($staff);
        $today = now($leads['timezone'])->toDateString();

        return [
            'count' => $leads['total_count'],
            'spoken_count' => $renderer->countPhrase($leads['total_count'], 'lead', 'leads'),
            'day' => $renderer->dayPhrase($leads['from'], $today),
            'date' => $leads['from'],
            'timezone' => $leads['timezone'],
        ];
    }
}
