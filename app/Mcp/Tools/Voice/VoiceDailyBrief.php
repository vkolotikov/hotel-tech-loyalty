<?php

namespace App\Mcp\Tools\Voice;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\VoiceTool;
use App\Models\User;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class VoiceDailyBrief extends VoiceTool
{
    /** The largest page listBookings allows; more than this is reported as "at least". */
    private const BOOKING_PAGE = 50;

    protected string $name = 'voice_daily_brief';

    protected string $title = 'Summarize a day for speech';

    protected string $description = 'Summarize one day for a spoken answer: how many CRM leads were created and how many service appointments are booked. Omit the date for today. Use this for "what does today look like" instead of calling several tools. Speak spoken_summary as returned. When booking_count_is_partial is true the appointment figure is a floor, not a total, and the wording already says so.';

    protected array $rules = [
        'date' => 'sometimes|filled|date_format:Y-m-d',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'date' => $schema->string()->format('date')->description('The day in the organization timezone; omit for today.'),
        ];
    }

    protected function speak(array $data, CustomerBookingAccess $access, User $staff): array
    {
        $date = $data['date'] ?? null;
        $leads = $access->listLeads(array_filter(['from' => $date, 'to' => $date, 'limit' => 1]));
        $bookings = $access->listBookings([
            'kind' => 'service', 'from' => $leads['from'], 'to' => $leads['from'],
            'limit' => self::BOOKING_PAGE,
        ]);

        $renderer = $this->renderer($staff);
        $counted = $this->countBookings($bookings);
        $day = $renderer->dayPhrase($leads['from'], now($leads['timezone'])->toDateString());

        $spokenLeads = $renderer->countPhrase($leads['total_count'], 'new lead', 'new leads');
        $spokenBookings = $this->spokenBookingCount($counted, $renderer, 'appointment', 'appointments');

        return [
            'spoken_summary' => ucfirst($day).': '.$spokenLeads.' and '.$spokenBookings.'.',
            'lead_count' => $leads['total_count'],
            'booking_count' => $counted['count'],
            'booking_count_is_partial' => $counted['at_least'],
            'date' => $leads['from'],
            'timezone' => $leads['timezone'],
        ];
    }
}
