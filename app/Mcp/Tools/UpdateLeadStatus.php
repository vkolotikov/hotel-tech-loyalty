<?php

namespace App\Mcp\Tools;

use App\Mcp\Support\CustomerBookingAccess;
use App\Mcp\Support\HexaTechTool;
use App\Mcp\Support\LeadWorkflowAccess;
use Illuminate\Contracts\JsonSchema\JsonSchema;

class UpdateLeadStatus extends HexaTechTool
{
    protected string $name = 'update_lead_status';

    protected string $title = 'Change a CRM lead\'s status';

    protected string $description = 'Change exactly one authorized lead to a configured pipeline stage ONLY when the user instructs this change. First read get_lead; select stage_id from status_options and pass its exact revision as expected_revision. If the desired stage is unclear, ask the user. For a lost stage a user-selected lost_reason_id is required. Property-linked won transitions require the CRM portal for reservation conversion. Status and pipeline stage remain synchronized with one timeline entry and audit. Use a fresh UUID request_id; retries must reuse it and identical arguments. Stale revisions fail without changes. Preparing an email does not mean it was sent: never move to a sent/contacted stage solely because a draft was prepared. No email, booking or payment is changed.';

    protected bool $readOnly = false;

    protected bool $destructive = true;

    protected array $rules = [
        'lead_id' => 'required|integer|min:1',
        'stage_id' => 'required|integer|min:1',
        'expected_revision' => 'required|string|size:64|regex:/^[a-f0-9]{64}$/',
        'request_id' => 'required|uuid',
        'lost_reason_id' => 'sometimes|filled|integer|min:1',
        'note' => 'sometimes|filled|string|max:1000|regex:/\S/u',
    ];

    public function schema(JsonSchema $schema): array
    {
        return [
            'lead_id' => $schema->integer()->min(1)->required(),
            'stage_id' => $schema->integer()->min(1)->required()->description('User-requested target stage ID from get_lead.status_options.'),
            'expected_revision' => $schema->string()->min(64)->max(64)->required()->description('Exact revision from the latest get_lead response.'),
            'request_id' => $schema->string()->format('uuid')->required()->description('Fresh UUID for this intended change; reuse unchanged on timeout retry.'),
            'lost_reason_id' => $schema->integer()->min(1)->description('Required only for a lost stage; use a reason returned by get_lead.'),
            'note' => $schema->string()->min(1)->max(1000)->description('Optional user-requested context for the status-change timeline.'),
        ];
    }

    protected function execute(array $data, CustomerBookingAccess $access): array
    {
        return app(LeadWorkflowAccess::class)->updateStatus($data);
    }
}
