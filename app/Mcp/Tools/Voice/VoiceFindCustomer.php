<?php

namespace App\Mcp\Tools\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\VoiceTool;
use App\Models\User;
use App\Voice\SpeakableRenderer;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class VoiceFindCustomer extends VoiceTool
{
    private const SPOKEN_LIMIT = 3;

    protected string $name = 'voice_find_customer';

    protected string $title = 'Find a customer for speech';

    protected string $description = 'Find customers by name or company for a spoken answer. A nonblank search of at least two characters is required; never search blank to list everyone. When needs_disambiguation is true, read spoken_summary and ask which person is meant instead of assuming the first match. Contact details are deliberately absent and must not be spoken or requested.';

    protected array $rules = [
        'query' => 'required|filled|string|min:2|max:120|regex:/\S/u',
    ];

    protected array $messages = [
        'query.required' => 'Say which customer to look for; a blank search is not allowed.',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'query' => $schema->string()->min(2)->max(120)->required()
                ->description('Customer name or company as heard. Never blank.'),
        ];
    }

    protected function speak(array $data, CustomerBookingAccess $access, User $staff): array
    {
        $result = $access->searchCustomers(['query' => $data['query'], 'limit' => self::SPOKEN_LIMIT + 1]);
        $renderer = $this->renderer($staff);

        $matches = array_slice($result['customers'], 0, self::SPOKEN_LIMIT);
        $names = array_map(fn ($c) => $renderer->personName($c['full_name'] ?? null), $matches);

        // Allowlisted for the same reason as VoiceNextBookings: the model needs
        // the id to act on, and the company to tell two people apart. The
        // customer row also carries email, phone and country.
        $customers = array_map(fn ($c, $name) => $renderer->redactContact([
            'id' => $c['id'] ?? null,
            'company' => $c['company'] ?? null,
            'spoken_name' => $name,
        ]), $matches, $names);

        $ambiguous = count($result['customers']) > 1;

        return [
            'spoken_summary' => $this->summarize($names, $customers, $ambiguous, $renderer),
            'needs_disambiguation' => $ambiguous,
            'customers' => $customers,
            'match_count' => count($result['customers']),
        ];
    }

    private function summarize(array $names, array $customers, bool $ambiguous, SpeakableRenderer $renderer): string
    {
        if ($names === []) {
            return 'I could not find anyone with that name.';
        }

        if (! $ambiguous) {
            return 'I found '.$names[0].'.';
        }

        // Two customers can share a first name and last initial, so the spoken
        // options must be told apart by something. The company usually does it.
        $labels = [];
        $distinguishable = true;

        foreach ($names as $index => $name) {
            $shared = count(array_keys($names, $name, true)) > 1;
            $company = $customers[$index]['company'] ?? null;

            if ($shared && blank($company)) {
                $distinguishable = false;
            }

            $labels[] = $shared && filled($company) ? $name.' at '.$company : $name;
        }

        // Reading out "Morgan L. or Morgan L.?" is not an answerable question.
        if (! $distinguishable) {
            return 'I found '.$renderer->countPhrase(count($names), 'person', 'people')
                .' called '.$names[0].'. Can you give me the company or the full surname?';
        }

        return 'I found '.implode(', ', $labels).'. Which one do you mean?';
    }
}
