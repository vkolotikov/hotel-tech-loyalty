<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Jobs\GenerateLeadAssistant;
use App\Models\Brand;
use App\Models\CrmLeadAssistant;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\User;
use App\Scopes\BrandScope;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class LeadAssistant
{

    public const EMAIL_MODES = ['proposal', 'reply', 'follow_up'];

    public const MODES = ['brief', 'sales_strategy', 'marketing_strategy', ...self::EMAIL_MODES];

    public const STRATEGIES = ['sales_strategy', 'marketing_strategy'];

    public const STRATEGY_LIMIT = 10000;

    private const MAX_AGE_MINUTES = 12;

    public function data(Inquiry $lead, Brand $brand, ?User $user = null): array
    {
        $state = $this->query($lead->id, $brand->id)->first();
        $run = $state?->run;
        if ($this->expired($run)) {
            $run = [...$run, 'status' => 'failed', 'error' => 'assistant_timed_out'];
        }

        $results = $state->results ?? [];
        $quote = LeadEmailEvidence::currentQuote($state, $lead);
        $mailResults = array_intersect(self::EMAIL_MODES, array_keys($results));
        if ($mailResults) {
            $policy = LeadEmailEvidence::policy($lead);
            $latest = $user ? app(LeadAssistantContext::class)->currentMessageTimes($lead, $brand, $user) : [];
            foreach ($mailResults as $mode) {
                $result = $results[$mode];
                if (array_key_exists('contact_id', $result) && $result['contact_id'] !== $lead->guest_id) {
                    unset($results[$mode]);
                    continue;
                }
                $results[$mode]['can_revise'] = array_key_exists('contact_id', $result);
                $times = $result['coverage']['message_times'] ?? null;
                $results[$mode]['new_correspondence'] = array_any(array_keys($latest), fn ($channel) =>
                    $latest[$channel] > ($times === null ? strtotime($result['generated_at'] ?? '') : ($times[$channel] ?? 0)));
                if ($code = LeadEmailEvidence::recheck($policy, $mode, $quote, (int) $brand->organization_id, $result)) {
                    $results[$mode] = [...$results[$mode], ...LeadEmailEvidence::hold($code, $result['language'] ?? 'en')];
                }
            }
        }

        return [
            'brand' => ['id' => (int) $brand->id, 'name' => $brand->name],
            'revision' => $state->revision ?? 0,
            'run' => $run ? array_intersect_key($run, array_flip(['id', 'mode', 'status', 'error', 'started_at', 'finished_at'])) : null,
            'results' => (object) $results,
            'quote' => $quote,
            'reviews' => (object) collect($state->email_reviews ?? [])->whereStrict('contact_id', $lead->guest_id)
                ->filter(fn ($review, $mode) => ($results[$mode]['id'] ?? '') === $review['source_id'] && ! empty($results[$mode]['body']))
                ->map(fn ($review) => array_intersect_key($review, array_flip(['source_id', 'subject', 'body', 'approved_at'])))->all(),
            'strategies' => (object) ($state->strategies ?? []),
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
                if (isset($input['revise'])) {
                    EmailDraftRevision::changed();
                }
                return null;
            }
            if ($state && $state->brand_id !== (int) $brand->id) {
                $state->fill(['brand_id' => $brand->id, 'revision' => 0, 'results' => null, 'strategies' => null, 'approved_quote' => null, 'email_reviews' => null]);
            }
            $state ??= new CrmLeadAssistant(['inquiry_id' => $lead->id, 'brand_id' => $brand->id, 'revision' => 0]);
            $revision = [];
            if (isset($input['revise'])) {
                $original = $state->results[$input['mode']] ?? [];
                if (! in_array($input['mode'], self::EMAIL_MODES, true) || empty($original['body'])
                    || (int) $input['revise']['revision'] !== (int) $state->revision
                    || ($original['id'] ?? null) !== $input['revise']['source_id']
                    || ! array_key_exists('contact_id', $original) || $original['contact_id'] !== $current->guest_id
                    || LeadEmailEvidence::recheck(LeadEmailEvidence::policy($current), $input['mode'], LeadEmailEvidence::currentQuote($state, $current), (int) $brand->organization_id, $original)) {
                    EmailDraftRevision::changed();
                }
                $revision = ['revise' => $input['revise'], 'contact_id' => $current->guest_id,
                    'quote_stamp' => $original['quote_stamp'] ?? LeadEmailEvidence::quoteStamp(null, (int) $brand->organization_id)];
            }
            $id = (string) Str::uuid();
            $state->fill(['run' => [
                'id' => $id, 'status' => 'queued', 'mode' => $input['mode'], 'language' => $input['language'],
                'focus' => $input['focus'] ?? '', 'requested_by' => $userId, 'started_at' => now()->toISOString(), ...$revision,
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
        $this->edit($lead, $brand, (int) $input['revision'], function (CrmLeadAssistant $state) use ($input) {
            $strategies = $state->strategies ?? [];
            $mode = $input['mode'];
            $body = trim((string) ($input['body'] ?? ''));
            if ($body === '') {
                unset($strategies[$mode]);
            } else {
                $strategies[$mode] = ['body' => $body, 'saved_at' => now()->toISOString()];
            }
            $state->strategies = $strategies;
        });
    }

    public function saveQuote(Inquiry $lead, Brand $brand, array $input, int $actor): void
    {
        $this->edit($lead, $brand, (int) $input['revision'], function (CrmLeadAssistant $state) use ($input, $actor, $lead) {
            $state->approved_quote = $input['quote'] === null ? null : [...LeadQuote::approved($input['quote'], $actor), 'contact_id' => $lead->guest_id];
            $quote = $state->approved_quote;
            if ($quote && $quote['valid_until'] >= \App\Services\Appointments\VenueClock::today((int) $lead->organization_id)
                && \Brick\Math\BigDecimal::of($quote['total'])->isLessThanOrEqualTo('9999999999.99')) {
                Inquiry::withoutGlobalScope(BrandScope::class)->whereKey($lead->id)->whereNull('total_value')
                    ->whereNull('rate_offered')->where(fn ($q) => $q->whereNull('paid_amount')->orWhere('paid_amount', 0))
                    ->update(['total_value' => (string) \Brick\Math\BigDecimal::of($quote['total'])->toScale(2, \Brick\Math\RoundingMode::HalfUp),
                        'currency' => $quote['currency']]);
            }
        });
    }

    public function reviewEmail(Inquiry $lead, Brand $brand, array $input, int $actor): void
    {
        $this->edit($lead, $brand, (int) $input['revision'], function (CrmLeadAssistant $state) use ($lead, $input, $actor) {
            $mode = $input['mode'];
            $original = $state->results[$mode] ?? [];
            if (($original['id'] ?? '') !== $input['source_id'] || empty($original['body'])
                || (array_key_exists('contact_id', $original) && $original['contact_id'] !== $lead->guest_id)
                || LeadEmailEvidence::recheck(LeadEmailEvidence::policy($lead), $mode, LeadEmailEvidence::currentQuote($state, $lead), (int) $lead->organization_id, $original)) {
                throw new AiHelperRefused('strategy_changed', 'This draft changed. Reload it before reviewing.', 409);
            }
            $reviews = $state->email_reviews ?? [];
            $reviews[$mode] = [
                'source_id' => $original['id'], 'contact_id' => $lead->guest_id, 'subject' => trim($input['subject']), 'body' => trim($input['body']),
                'original' => ['subject' => $original['subject'], 'body' => $original['body']],
                'reply_to' => $original['coverage']['reply_to'] ?? null, 'generated_at' => $original['generated_at'],
                'approved_by' => $actor, 'approved_at' => now()->toISOString(),
            ];
            $state->email_reviews = $reviews;
        });
    }

    private function edit(Inquiry $lead, Brand $brand, int $revision, Closure $change): void
    {
        DB::transaction(function () use ($lead, $brand, $revision, $change) {
            $current = Inquiry::withoutGlobalScope(BrandScope::class)->lockForUpdate()->findOrFail($lead->id);
            abort_unless(SalesBrand::leadBrandId($current) === (int) $brand->id, 409);
            $state = CrmLeadAssistant::query()->lockForUpdate()->find($lead->id);
            if ($current->guest_id !== $lead->guest_id || ($state && $state->brand_id !== (int) $brand->id) || ($state->revision ?? 0) !== $revision) {
                throw new AiHelperRefused('strategy_changed', 'The lead assistant changed. Reload it before saving.', 409);
            }
            $state ??= new CrmLeadAssistant(['inquiry_id' => $lead->id, 'brand_id' => $brand->id]);
            $change($state);
            $state->revision = $revision + 1;
            $state->save();
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

    /** @return Builder<CrmLeadAssistant> */
    private function query(int $leadId, int $brandId): Builder
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
