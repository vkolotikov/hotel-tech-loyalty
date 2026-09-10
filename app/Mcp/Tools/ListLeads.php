<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class ListLeads extends HexaTechTool
{
    protected string $name = 'list_leads';

    protected string $title = 'List HexaTech CRM leads';

    protected string $description = 'List CRM leads (inquiries) created in an inclusive calendar-date range, using the connected organization timezone. Omit dates for today; one supplied date selects that day. This is lead creation time, not a booking date, follow-up due date, or rolling last 24 hours. The maximum range is 90 calendar days. Includes all current statuses, including won/confirmed and lost, unless status is supplied. Optional query searches literal parts of customer name/company or lead title/source. Optional brand_id only narrows permitted records. Returns an authorized total_count and a bounded newest-first page with status, pipeline stage, brand and basic customer identity. Lead IDs are inquiry IDs, not customer or booking IDs; use get_customer with the returned customer.id only if contact details are needed. Follow next_page without changing filters or limit; results_truncated means the page cap was reached and the range or query must be narrowed. Never describe one page as every matching lead.';

    protected array $rules = [
        'period' => 'sometimes|filled|in:today,yesterday',
        'from' => 'sometimes|filled|date_format:Y-m-d',
        'to' => 'sometimes|filled|date_format:Y-m-d',
        'status' => 'sometimes|filled|string|min:1|max:50|regex:/\S/u',
        'query' => 'sometimes|filled|string|min:2|max:120|regex:/\S/u',
        'brand_id' => 'sometimes|filled|integer|min:1',
        'limit' => 'sometimes|filled|integer|min:1|max:25',
        'page' => 'sometimes|filled|integer|min:1|max:'.CustomerBookingAccess::MAX_LEAD_PAGE,
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'period' => $schema->string()->enum(['today', 'yesterday'])->description('Resolve a relative creation day on the server in the organization timezone. For yesterday use this instead of guessing dates. Do not combine with from/to.'),
            'from' => $schema->string()->format('date')->description('First creation date in the organization timezone; omit both dates for today.'),
            'to' => $schema->string()->format('date')->description('Last creation date, inclusive. A single supplied date selects that day.'),
            'status' => $schema->string()->min(1)->max(50)->description('Exact current CRM status, including custom status names. Omit to include all statuses.'),
            'query' => $schema->string()->min(2)->max(120)->description('Literal customer name/company or lead title/source; omit to list all matching leads in the bounded date range.'),
            'brand_id' => $schema->integer()->min(1)->description('Optional permitted brand ID; omit for all brands allowed to the connected account.'),
            'limit' => $schema->integer()->min(1)->max(25)->default(20),
            'page' => $schema->integer()->min(1)->max(CustomerBookingAccess::MAX_LEAD_PAGE)->default(1),
        ];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return $access->listLeads($data);
    }
}
