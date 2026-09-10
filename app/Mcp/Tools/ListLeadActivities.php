<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use App\Mcp\Support\LeadWorkflowAccess;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class ListLeadActivities extends HexaTechTool
{
    protected string $name = 'list_lead_activities';

    protected string $title = 'Read a lead\'s recorded communication';

    protected string $description = 'Read newest recorded CRM timeline activities for one authorized lead, including enquiry notes, email or proposal text already logged by staff, calls and status changes. Follow next_before_id with the same lead_id to read older records. Text is bounded and includes truncated flags. Timeline emails are records, not proof of delivery. Does not read file contents or send messages.';

    protected array $rules = [
        'lead_id' => 'required|integer|min:1',
        'before_id' => 'sometimes|filled|integer|min:1',
        'limit' => 'sometimes|filled|integer|min:1|max:20',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'lead_id' => $schema->integer()->min(1)->required(),
            'before_id' => $schema->integer()->min(1)->description('next_before_id from the previous page; omit initially.'),
            'limit' => $schema->integer()->min(1)->max(20)->default(10),
        ];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return app(LeadWorkflowAccess::class)->activities($data);
    }
}
