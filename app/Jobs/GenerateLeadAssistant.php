<?php

namespace App\Jobs;

use App\Exceptions\AiHelperRefused;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\Crm\CrmAccess;
use App\Services\Crm\LeadAssistant;
use App\Services\Crm\LeadAssistantWriter;
use App\Services\Crm\SalesBrand;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

final class GenerateLeadAssistant implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 150;

    public function __construct(public int $leadId, public int $brandId, public int $orgId, public string $runId)
    {
        $this->onQueue('ai');
    }

    public function handle(LeadAssistant $assistant, SalesBrand $scope, LeadAssistantWriter $writer): void
    {
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->orgId);
        app()->instance('current_brand_id', $this->brandId);
        try {
            $lead = Inquiry::withoutGlobalScope(BrandScope::class)->find($this->leadId);
            $claimed = $lead ? $assistant->claim($this->leadId, $this->brandId, $this->runId) : null;
            if (! $claimed) {
                return;
            }
            $run = $claimed['run'];
            $org = Organization::findOrFail($this->orgId);
            $user = User::findOrFail($run['requested_by']);
            if (! $org->is_active || ! $org->workspaceEnabled('crm')
                || (! $org->holdsModule('crm') && ! $org->holdsModule('chat'))
                || (! $user->isPlatformAdmin() && ((int) $user->organization_id !== $this->orgId || ! CrmAccess::role($user)))) {
                throw new AiHelperRefused('assistant_access_changed', 'Access to this lead has changed.', 403);
            }
            $brand = $scope->forLead($user, $lead);
            $result = $writer->generate($lead, $brand, $org, $user, $run, $claimed['strategies']);
            $assistant->complete($this->leadId, $this->brandId, $this->runId, $result);
        } catch (AiHelperRefused $error) {
            $assistant->complete($this->leadId, $this->brandId, $this->runId, error: $error->errorCode);
        } catch (HttpExceptionInterface $error) {
            $assistant->complete($this->leadId, $this->brandId, $this->runId, error: 'assistant_access_changed');
        } catch (Throwable $error) {
            Log::warning('CRM lead assistant failed', ['org_id' => $this->orgId, 'exception' => $error::class]);
            $assistant->complete($this->leadId, $this->brandId, $this->runId, error: 'ai_failed');
        } finally {
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    public function failed(?Throwable $error): void
    {
        app(LeadAssistant::class)->complete($this->leadId, $this->brandId, $this->runId, error: 'ai_failed');
    }
}
