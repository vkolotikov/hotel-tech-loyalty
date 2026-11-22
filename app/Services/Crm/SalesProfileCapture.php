<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Jobs\CaptureSalesProfile;
use App\Models\Brand;
use App\Models\CrmSalesProfileCapture;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class SalesProfileCapture
{
    private const ACTIVE = ['queued', 'running'];

    private const TIMEOUT_MINUTES = 20;

    public function data(Brand $brand): array
    {
        $row = CrmSalesProfileCapture::query()->find($brand->id, ['brand_id', 'run_id', 'status', 'queued_at', 'outcome']);
        $run = $row ? [
            'id' => $row->run_id,
            'status' => $this->expired($row) ? 'failed' : $row->status,
            ...($this->expired($row) ? ['error' => 'capture_timed_out'] : ($row->outcome ?? [])),
        ] : null;

        return ['capture' => $run, 'limits' => SalesCaptureFiles::limits()];
    }

    public function start(Organization $org, Brand $brand, array $input, array $uploads, int $userId): void
    {
        abort_unless((int) $brand->organization_id === (int) $org->id && (int) $input['profile_brand'] === (int) $brand->id, 409);
        self::checkAvailability($org);
        $website = SalesCaptureWebsite::clean($input['website'] ?? null);
        $search = (bool) ($input['search_web'] ?? false);
        $name = trim((string) ($input['company_name'] ?? ''));
        if (isset($input['website']) && $website === null) {
            throw new AiHelperRefused('capture_bad_website', 'Enter a public website address.', 422);
        }
        if (($search && $name === '' && $website === null) || (! $search && $website === null && $uploads === [])) {
            throw new AiHelperRefused('capture_sources_required', 'Add a website, a business to search for, or a file.', 422);
        }
        $files = SalesCaptureFiles::read($uploads);
        $id = DB::transaction(function () use ($brand, $userId, $website, $search, $name, $files, $input): ?string {
            $brand = Brand::query()->lockForUpdate()->findOrFail($brand->id);
            $row = CrmSalesProfileCapture::query()->lockForUpdate()->find($brand->id, ['brand_id', 'status', 'queued_at']);
            if ($row && in_array($row->status, self::ACTIVE, true) && ! $this->expired($row)) {
                return null;
            }
            $row ??= new CrmSalesProfileCapture(['brand_id' => $brand->id]);
            $id = (string) Str::uuid();
            $row->fill([
                'run_id' => $id, 'requested_by' => $userId, 'status' => 'queued', 'queued_at' => now(), 'outcome' => null,
                'input' => ['name' => $name, 'website' => $website, 'search' => $search, 'language' => $input['language'], 'files' => $files],
            ])->save();

            return $id;
        });
        if ($id !== null) {
            try {
                CaptureSalesProfile::dispatch($org->id, $brand->id, $id);
            } catch (Throwable $error) {
                Log::warning('CRM business profile capture dispatch failed', ['brand_id' => $brand->id, 'exception' => $error::class]);
                $this->finish($brand->id, $id, 'failed', ['error' => 'ai_failed']);
            }
        }
    }

    public function claim(int $brand, string $run): ?array
    {
        return DB::transaction(function () use ($brand, $run): ?array {
            $row = CrmSalesProfileCapture::query()->whereKey($brand)->where('run_id', $run)->where('status', 'queued')
                ->where('queued_at', '>', now()->subMinutes(self::TIMEOUT_MINUTES))->lockForUpdate()->first();
            if (! $row) {
                return null;
            }
            $work = ['actor' => $row->requested_by, 'input' => $row->input];
            $row->update(['status' => 'running', 'input' => null]);

            return $work;
        });
    }

    public function finish(int $brand, string $run, string $status, array $outcome): void
    {
        CrmSalesProfileCapture::query()->whereKey($brand)->where('run_id', $run)->whereIn('status', self::ACTIVE)
            ->update(['status' => $status, 'input' => null, 'outcome' => json_encode($outcome, JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR)]);
    }

    public static function expirePending(): int
    {
        return CrmSalesProfileCapture::query()->whereIn('status', self::ACTIVE)->where('queued_at', '<=', now()->subMinutes(self::TIMEOUT_MINUTES))
            ->update(['status' => 'failed', 'input' => null, 'outcome' => '{"error":"capture_timed_out"}']);
    }

    public static function checkAvailability(Organization $org): void
    {
        if (! config('openai.api_key')) {
            throw new AiHelperRefused('assistant_unavailable', 'The profile assistant is unavailable for this workspace.', 503);
        }
        AiHelperRefused::unlessAllowanceLeft($org);
    }

    private function expired(CrmSalesProfileCapture $row): bool
    {
        return in_array($row->status, self::ACTIVE, true) && $row->queued_at->lte(now()->subMinutes(self::TIMEOUT_MINUTES));
    }
}
