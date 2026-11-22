<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Jobs\GenerateLeadAssistant;
use App\Models\Brand;
use App\Models\CrmLeadAssistant;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Scopes\BrandScope;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class LeadAssistant
{
    public const MODEL = 'gpt-5-mini';

    public const MODES = ['brief', 'sales_strategy', 'marketing_strategy', 'proposal', 'reply'];

    public const STRATEGIES = ['sales_strategy', 'marketing_strategy'];

    public const STRATEGY_LIMIT = 10000;

    private const MAX_AGE_MINUTES = 12;

    public function data(Inquiry $lead, Brand $brand): array
    {
        $state = $this->query($lead->id, $brand->id)->first();
        $run = $state?->run;
        if ($this->expired($run)) {
            $run = [...$run, 'status' => 'failed', 'error' => 'assistant_timed_out'];
        }

        return [
            'brand' => ['id' => (int) $brand->id, 'name' => $brand->name],
            'revision' => $state?->revision ?? 0,
            'run' => $run ? array_diff_key($run, array_flip(['requested_by', 'language', 'focus'])) : null,
            'results' => (object) ($state?->results ?? []),
            'strategies' => (object) ($state?->strategies ?? []),
        ];
    }

    public function start(Inquiry $lead, Brand $brand, Organization $org, array $input, int $userId): void
    {
        self::checkAvailability($org);
        $id = DB::transaction(function () use ($lead, $brand, $input, $userId): ?string {
            // Lock the parent even on the very first run, when there is no state row yet.
            $current = Inquiry::withoutGlobalScope(BrandScope::class)->lockForUpdate()->findOrFail($lead->id);
            abort_unless(SalesBrand::leadBrandId($current) === (int) $brand->id, 409);
            $state = CrmLeadAssistant::query()->lockForUpdate()->find($lead->id);
            if ($state?->brand_id === (int) $brand->id && $this->active($state->run) && ! $this->expired($state->run)) {
                return null;
            }
            if ($state && $state->brand_id !== (int) $brand->id) {
                $state->fill(['brand_id' => $brand->id, 'revision' => 0, 'results' => null, 'strategies' => null]);
            }
            $state ??= new CrmLeadAssistant(['inquiry_id' => $lead->id, 'brand_id' => $brand->id, 'revision' => 0]);
            $id = (string) Str::uuid();
            $state->fill(['run' => [
                'id' => $id, 'status' => 'queued', 'mode' => $input['mode'], 'language' => $input['language'],
                'focus' => $input['focus'] ?? '', 'requested_by' => $userId, 'started_at' => now()->toISOString(),
            ]])->save();

            return $id;
        });
        if ($id) {
            try {
                GenerateLeadAssistant::dispatch($lead->id, $brand->id, $org->id, $id);
            } catch (Throwable $error) {
                Log::warning('CRM lead assistant dispatch failed', ['org_id' => $org->id, 'exception' => $error::class]);
                $this->complete($lead->id, $brand->id, $id, error: 'ai_failed');
            }
        }
    }

    public function saveStrategy(Inquiry $lead, Brand $brand, array $input): void
    {
        DB::transaction(function () use ($lead, $brand, $input): void {
            $current = Inquiry::withoutGlobalScope(BrandScope::class)->lockForUpdate()->findOrFail($lead->id);
            abort_unless(SalesBrand::leadBrandId($current) === (int) $brand->id, 409);
            $state = $this->query($lead->id, $brand->id)->lockForUpdate()->first();
            if (($state?->revision ?? 0) !== (int) $input['revision']
                || (! $state && CrmLeadAssistant::query()->whereKey($lead->id)->exists())) {
                throw new AiHelperRefused('strategy_changed', 'The strategy changed. Reload it before saving.', 409);
            }
            $state ??= new CrmLeadAssistant(['inquiry_id' => $lead->id, 'brand_id' => $brand->id, 'revision' => 0]);
            $strategies = $state->strategies ?? [];
            $mode = $input['mode'];
            $body = trim((string) ($input['body'] ?? ''));
            if ($body === '') {
                unset($strategies[$mode]);
            } else {
                $strategies[$mode] = ['body' => $body, 'saved_at' => now()->toISOString()];
            }
            $state->fill(['strategies' => $strategies, 'revision' => $state->revision + 1])->save();
        });
    }

    public function claim(int $leadId, int $brandId, string $runId): ?array
    {
        return DB::transaction(function () use ($leadId, $brandId, $runId): ?array {
            $state = $this->query($leadId, $brandId)->lockForUpdate()->first();
            $run = $state?->run;
            if (($run['id'] ?? null) !== $runId || $run['status'] !== 'queued' || $this->expired($run)) {
                return null;
            }
            $state->update(['run' => [...$run, 'status' => 'running']]);

            return ['run' => $run, 'strategies' => $state->strategies ?? []];
        });
    }

    public function complete(int $leadId, int $brandId, string $runId, ?array $result = null, ?string $error = null): void
    {
        DB::transaction(function () use ($leadId, $brandId, $runId, $result, $error): void {
            $lead = isset($result['signals'])
                ? Inquiry::withoutGlobalScope(BrandScope::class)->lockForUpdate()->find($leadId) : null;
            $state = $this->query($leadId, $brandId)->lockForUpdate()->first();
            $run = $state?->run;
            if (($run['id'] ?? null) !== $runId || ! $this->active($run)) {
                return;
            }
            $results = $state->results ?? [];
            $finished = now()->toISOString();
            if ($result !== null) {
                $results[$run['mode']] = ['id' => $runId, ...$result, 'generated_at' => $finished];
            }
            if ($lead && SalesBrand::leadBrandId($lead) === $brandId) {
                $signals = $result['signals'];
                $lead->forceFill([
                    'ai_brief' => $result['summary'], 'ai_brief_at' => now(), 'ai_intent' => $signals['intent'],
                    'ai_win_probability' => $signals['win_probability'], 'ai_going_cold_risk' => $signals['going_cold_risk'],
                    'ai_suggested_action' => $signals['suggested_action'],
                ])->save();
            }
            $state->update([
                'run' => [
                    'id' => $runId, 'mode' => $run['mode'], 'status' => $error ? 'failed' : 'ready',
                    'started_at' => $run['started_at'], 'finished_at' => $finished, 'error' => $error,
                ],
                'results' => $results,
            ]);
        });
    }

    public static function checkAvailability(Organization $org): void
    {
        if (! config('openai.api_key')) {
            throw new AiHelperRefused('assistant_unavailable', 'The lead assistant is unavailable for this workspace.', 503);
        }
        AiHelperRefused::unlessAllowanceLeft($org);
    }

    private function query(int $leadId, int $brandId): \Illuminate\Database\Eloquent\Builder
    {
        return CrmLeadAssistant::query()->whereKey($leadId)->where('brand_id', $brandId);
    }

    private function active(?array $run): bool
    {
        return in_array($run['status'] ?? null, ['queued', 'running'], true);
    }

    private function expired(?array $run): bool
    {
        return $this->active($run) && ($run['started_at'] ?? '') < now()->subMinutes(self::MAX_AGE_MINUTES)->toISOString();
    }
}
