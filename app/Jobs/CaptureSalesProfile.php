<?php

namespace App\Jobs;

use App\Exceptions\AiHelperRefused;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\User;
use App\Services\AiUsageService;
use App\Services\Crm\CrmAccess;
use App\Services\Crm\SalesBrand;
use App\Services\Crm\SalesCaptureAi;
use App\Services\Crm\SalesCaptureWebsite;
use App\Services\Crm\SalesProfileCapture;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

final class CaptureSalesProfile implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 420;

    public function __construct(public int $orgId, public int $brandId, public string $runId)
    {
        $this->onQueue('ai');
    }

    public function handle(SalesProfileCapture $capture, SalesCaptureWebsite $website, SalesCaptureAi $ai, AiUsageService $usage): void
    {
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->orgId);
        app()->instance('current_brand_id', $this->brandId);
        try {
            if (! Brand::query()->whereKey($this->brandId)->exists() || ! ($claimed = $capture->claim($this->brandId, $this->runId))) {
                return;
            }
            $org = Organization::findOrFail($this->orgId);
            $user = User::find($claimed['actor']);
            if (! $org->is_active || ! $org->workspaceEnabled('crm')
                || (! $org->holdsModule('crm') && ! $org->holdsModule('chat')) || ! $user
                || (! $user->isPlatformAdmin() && (int) $user->organization_id !== $this->orgId)
                || ! CrmAccess::isManager($user)) {
                throw new AiHelperRefused('capture_access_changed', 'Access to this profile has changed.', 403);
            }
            app(SalesBrand::class)->forSettings($user, $this->brandId);
            SalesProfileCapture::checkAvailability($org);
            $outcome = $this->read($claimed['input'], $org, $user, $website, $ai, $usage);
            $capture->finish($this->brandId, $this->runId, $outcome['fields'] ? 'ready' : 'failed', $outcome);
        } catch (AiHelperRefused $error) {
            $capture->finish($this->brandId, $this->runId, 'failed', ['error' => $error->errorCode]);
        } catch (HttpExceptionInterface $error) {
            $capture->finish($this->brandId, $this->runId, 'failed', ['error' => 'capture_access_changed']);
        } catch (Throwable $error) {
            $this->logFailure($error);
            $capture->finish($this->brandId, $this->runId, 'failed', ['error' => 'ai_failed']);
        } finally {
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    private function read(array $input, Organization $org, User $user, SalesCaptureWebsite $website, SalesCaptureAi $ai, AiUsageService $usage): array
    {
        $warnings = [];
        $pages = [];
        if ($input['website']) {
            try {
                $pages = $website->pages($input['website']);
            } catch (Throwable $error) {
                $this->logFailure($error);
            }
            if (! $pages) {
                $warnings[] = 'capture_website_unreadable';
            }
        }
        $supplied = [];
        if ($pages || $input['files']) {
            try {
                $response = $ai->extract($pages, $input['files'], $input['language']);
                $this->meter($usage, $response, $user);
                $supplied = $response['fields'];
            } catch (Throwable $error) {
                $this->logFailure($error);
                $warnings[] = $input['files'] ? 'capture_documents_unreadable' : 'ai_failed';
                if ($pages && $input['files']) {
                    try {
                        SalesProfileCapture::checkAvailability($org);
                        $response = $ai->extract($pages, [], $input['language']);
                        $this->meter($usage, $response, $user);
                        $supplied = $response['fields'];
                    } catch (Throwable $error) {
                        $this->logFailure($error);
                    }
                }
            }
        }
        $public = [];
        $useIndexedSite = $input['website'] && ! $pages && ! $input['search'];
        if ($input['search'] || $useIndexedSite) {
            try {
                SalesProfileCapture::checkAvailability($org);
                // A public search gets the typed identity only. File names, documents and private text stay out.
                $response = $ai->research($input['name'], $input['website'], $input['language'], $useIndexedSite);
                $this->meter($usage, $response, $user);
                $public = $response['fields'];
                if ($public && $useIndexedSite) {
                    $warnings = array_values(array_diff($warnings, ['capture_website_unreadable']));
                    $warnings[] = 'capture_website_indexed';
                } elseif (! $public && $input['search']) {
                    $warnings[] = 'capture_web_unverified';
                }
            } catch (AiHelperRefused $error) {
                $warnings[] = $error->errorCode;
            } catch (Throwable $error) {
                $this->logFailure($error);
                $warnings[] = 'capture_web_unavailable';
            }
        }
        $fields = $supplied + $public;
        if ($pages && ! isset($fields['website'])) {
            $fields['website'] = ['value' => $input['website'], 'sources' => [array_diff_key($pages[0], ['text' => true])]];
        }

        return ['fields' => $fields, 'warnings' => $warnings, 'error' => $fields ? null : ($warnings[0] ?? 'capture_no_findings')];
    }

    private function meter(AiUsageService $usage, array $response, User $user): void
    {
        $usage->recordUsage($this->orgId, SalesCaptureAi::MODEL, (int) ($response['usage']['input_tokens'] ?? 0),
            (int) ($response['usage']['output_tokens'] ?? 0), 'crm_sales_capture',
            additionalCents: $response['searches'] ?? 0, userId: $user->id);
    }

    private function logFailure(Throwable $error): void
    {
        Log::warning('CRM business profile capture failed', ['brand_id' => $this->brandId, 'exception' => $error::class]);
    }

    public function failed(?Throwable $error): void
    {
        app(SalesProfileCapture::class)->finish($this->brandId, $this->runId, 'failed', ['error' => 'ai_failed']);
    }
}
