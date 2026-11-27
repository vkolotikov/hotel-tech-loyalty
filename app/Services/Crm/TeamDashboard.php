<?php

namespace App\Services\Crm;

use App\Models\EmailSuppression;
use App\Models\GuestBusinessProfile;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Integrations\CrmMail;
use App\Services\Portal\PortalBootstrap;
use App\Support\SharedCache;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

final class TeamDashboard
{
    public function __construct(private TeamEmailThreads $threads, private TeamPriorityReview $review, private TeamPerformance $performance) {}

    public function for(Organization $org, User $user, string $period, string $filter, int $page, int $size): array
    {
        $orgId = (int) $org->id;
        $access = CrmBrands::for($user);
        $selected = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $visible = $this->visible($orgId, $access);
        $mail = $orgId === CrmMail::ORGANIZATION && app(CrmMail::class)->available($user);
        $scope = hash('sha256', json_encode([$orgId, $selected, $access['all'], array_column($access['brands'], 'id'), $mail]));
        $now = CarbonImmutable::now(VenueClock::zone($orgId));
        $start = $period === 'month' ? $now->startOfMonth() : $now->startOfWeek(CarbonImmutable::MONDAY);
        $cache = SharedCache::store();
        $key = 'crm:team:v3:'.$scope.':'.$now->toDateString();
        $snapshot = $cache->remember($key, 45, fn () => $this->queue($visible, $org, $now, $mail));
        $portfolio = $cache->remember($key.':portfolio', 45, fn () => $this->performance->portfolio($visible, $org, $now));
        $series = $cache->remember($key.':'.$period, 45, fn () => $this->performance->period($visible, $org, $start, $now, $period === 'month'));
        [$actions, $reviewed] = $this->review->rank($snapshot['actions'], $org, $user, $selected, $scope);
        $attention = TeamAttention::lists($actions);
        // The first ranked action for each lead represents that opportunity, even if it has multiple email threads.
        $topLeads = collect($attention['needed'])->concat($attention['checkin'])->unique('lead_id')->take(3)->map(fn ($row) => \Illuminate\Support\Arr::only($row,
            ['lead_id','name','company','kind','priority','owner','signals','ai_reason','amount','currency','deadline']))->values()->all();
        $emails = array_filter($actions, fn ($row) => $row['kind'] === 'email');
        $urgent = array_filter($actions, fn ($row) => $row['priority'] === 'urgent');
        $filtered = $attention[$filter] ?? array_values($filter === 'urgent' ? $urgent : array_filter($actions, fn ($row) => $filter === 'all' || $row['kind'] === $filter));
        $pages = max(1, (int) ceil(count($filtered) / $size));
        $page = min($pages, $page);
        $rows = array_slice($filtered, ($page - 1) * $size, $size);
        $rows = array_map([TeamAttention::class, 'publicRow'], $rows);

        return [
            'period' => $period, 'from' => $start->toDateString(), 'through' => $now->toDateString(), 'as_of' => $snapshot['as_of'],
            'leads' => array_sum(array_column($series['days'], 'leads')), 'wins' => array_sum(array_column($series['days'], 'wins')),
            'undated_wins' => $series['undated'], 'days' => $series['days'], 'emails' => count($emails),
            'period_emails' => count(array_filter($emails, fn ($r) => $r['at'] >= $start->timestamp)),
            'arrivals' => $cache->remember($key.':arrivals', 45, fn () => $this->performance->arrivals($visible, $now)),
            'top_leads' => $topLeads, 'attention' => $attention['summary'], 'portfolio' => $portfolio, 'performance' => $series['performance'], 'urgent' => count($urgent),
            'actions_total' => count($actions), 'reviewed' => $reviewed, 'page' => $page, 'pages' => $pages,
            'matching' => count($filtered), 'actions' => $rows,
        ];
    }

    public function customers(Organization $org, User $user, string $period, TeamCustomers $customers): array
    {
        $orgId = (int) $org->id;
        $access = CrmBrands::for($user);
        $selected = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $scope = hash('sha256', json_encode([$orgId, $selected, $access['all'], array_column($access['brands'], 'id')]));
        $now = CarbonImmutable::now(VenueClock::zone($orgId));
        $start = match ($period) {
            'week' => $now->startOfWeek(CarbonImmutable::MONDAY), 'month' => $now->startOfMonth(), default => null,
        };
        return SharedCache::store()->remember('crm:team:customers:'.$scope.':'.$period.':'.$now->toDateString(), 45,
            fn () => $customers->ranking($this->visible($orgId, $access), $org, $start, $now));
    }

    /** @return Builder<Inquiry> */
    private function visible(int $orgId, array $access): Builder
    {
        $visible = Inquiry::query()->where('organization_id', $orgId);
        if (!$access['all']) {
            $visible->whereIntegerInRaw('brand_id', array_column($access['brands'], 'id'));
        }
        return $visible;
    }

    /** @param Builder<Inquiry> $visible */
    private function queue(Builder $visible, Organization $org, CarbonImmutable $now, bool $mail): array
    {
        $rows = $amounts = [];
        $venueCurrency = PortalBootstrap::currency($org);
        (clone $visible)->with(['guest:id,organization_id,full_name,company,email,phone,mobile,importance,vip_level,custom_data,email_consent,marketing_consent,consent_updated_at', 'pipelineStage:id,kind'])
            ->select(['id', 'organization_id', 'brand_id', 'guest_id', 'pipeline_stage_id', 'status', 'priority', 'assigned_to', 'total_value', 'currency',
                'custom_data', 'next_task_completed', 'next_task_due', 'last_contacted_at', 'fulfillment_stage', 'created_at', 'notes', 'special_requests'])
            ->chunkById(200, function ($leads) use (&$rows, &$amounts, $org, $now, $mail, $venueCurrency) {
                $conversations = $this->threads->conversations($leads, (int) $org->id, $mail);
                $threads = $conversations['email'];
                $addresses = $leads->filter(fn ($lead) => isset($threads[$lead->id]))->pluck('guest.email')->filter()->unique()->values()->all();
                $suppressed = EmailSuppression::forAddresses($addresses, (int) $org->id);
                $guestIds = $leads->pluck('guest')->filter()->pluck('id')->unique()->values()->all();
                $profiles = GuestBusinessProfile::whereIntegerInRaw('guest_id', $guestIds)->get(['guest_id', 'fields', 'discovery'])->mapWithKeys(function ($profile) {
                    $summary = $profile->fields['brand_summary'] ?? null;
                    if (!$summary) {
                        $summary = BusinessProfile::sourcedDiscovery($profile, [])['brand_summary']['value'] ?? '';
                    }
                    return [$profile->guest_id => mb_substr((string) $summary, 0, 480)];
                });
                foreach ($leads as $lead) {
                    $heads = $threads[$lead->id] ?? [];
                    $open = !in_array($lead->status, ['Confirmed', 'Lost'], true) && !in_array($lead->pipelineStage?->kind, ['won', 'lost'], true);
                    $facts = $this->facts($lead, $now);
                    $currency = $lead->value_currency ?? $venueCurrency;
                    $amount = $lead->total_value;
                    if ($open && $amount > 0 && $currency !== 'XXX') {
                        $amounts[$currency][] = (float) $amount;
                    }
                    $base = [
                        'lead_id' => $lead->id, 'brand_id' => $lead->brand_id, 'guest_id' => $lead->guest_id,
                        'name' => trim((string) $lead->guest?->full_name), 'company' => trim((string) $lead->guest?->company),
                        'owner' => $lead->assigned_to, 'amount' => $amount, 'currency' => $currency,
                        'deadline' => $facts['deadline'], 'quantity' => $facts['quantity'], 'signals' => $facts['signals'],
                        'score' => $facts['score'], 'age_days' => null, 'at' => $lead->created_at->timestamp ?? 0, 'source' => null, 'message_id' => null, 'subject' => '',
                        'evidence' => ['account' => $profiles->get($lead->guest_id, ''),
                            'request' => mb_substr(trim((string) $lead->special_requests.' '.(string) $lead->notes), 0, 750),
                            'size' => $facts['size']],
                    ];
                    $incoming = [];
                    foreach ($heads as $key => $head) {
                        if ($head['direction'] !== 'inbound') {
                            continue;
                        }
                        $wait = max(0, intdiv($now->timestamp - $head['at'], 3600));
                        $row = array_replace($base, ['kind' => 'email', 'key' => $lead->id.'-email-'.$key, 'source' => $head['source'],
                            'message_id' => $head['id'], 'subject' => $head['subject'], 'at' => $head['at'], 'age_days' => intdiv($wait, 24)]);
                        $row['score'] += 30 + min(16, intdiv($wait, 12));
                        if ($wait >= 48) {
                            $row['signals'][] = 'waiting';
                        }
                        $incoming[] = $row;
                    }
                    $due = $lead->next_task_due?->toDateString();
                    $delivery = in_array('delivery_due', $base['signals'], true) && !in_array(strtolower((string) $lead->fulfillment_stage), ['completed','delivered','cancelled'], true);
                    $kind = null;
                    if ($delivery && ($open || $lead->status === 'Confirmed' || $lead->pipelineStage?->kind === 'won')) {
                        $kind = 'delivery';
                    } elseif ($open && !$lead->next_task_completed && $due && $due <= $now->toDateString()) {
                        $kind = 'followup';
                        $base['signals'][] = $due < $now->toDateString() ? 'overdue' : 'due_today';
                        $base['score'] += $due < $now->toDateString() ? 32 : 24;
                    } elseif ($open && !$heads && empty($conversations['other'][$lead->id]) && !$lead->last_contacted_at && $lead->created_at?->lte($now)
                        && ($lead->next_task_completed || !$due || $due <= $now->toDateString())
                        && in_array(strtolower(trim((string) $lead->status)), ['new', 'new enquiry', 'new inquiry', ''], true)) {
                        $kind = 'new';
                        $base['age_days'] = intdiv($now->timestamp - $lead->created_at->timestamp, 86400);
                        $base['score'] += 15 + min(20, $base['age_days']);
                    }
                    if ($incoming) {
                        foreach ($incoming as $row) {
                            if ($kind) {
                                $row['fallback'] = ['kind' => $kind, 'key' => $lead->id.'-'.$kind, 'signals' => $base['signals'], 'score' => $base['score'], 'at' => $base['at']];
                            }
                            $rows[] = $row;
                        }
                        continue;
                    }
                    $last = $heads ? collect($heads)->sortByDesc('at')->first() : null;
                    $age = $last ? intdiv($now->timestamp - $last['at'], 86400) : 0;
                    if ($open && $last && $age >= TeamAttention::WAIT_DAYS && ($lead->next_task_completed || !$due || $due <= $now->toDateString())
                        && ($conversations['other'][$lead->id] ?? 0) < $last['at'] && (!$lead->last_contacted_at || $lead->last_contacted_at->timestamp <= $last['at'])) {
                        $address = EmailSuppression::normalise((string) $lead->guest?->email);
                        if ($address !== '' && !LeadEmailEvidence::stopReason(LeadEmailEvidence::policy($lead, isset($suppressed[$address])), 'follow_up')) {
                            $base['outreach'] = ['at' => $last['at'], 'age_days' => $age, 'source' => $last['source'], 'message_id' => $last['id'], 'subject' => $last['subject']];
                            if (!$kind) {
                                $kind = 'checkin';
                                $base = array_replace($base, $base['outreach']);
                                $base['score'] += 18 + min(14, $age - TeamAttention::WAIT_DAYS);
                            }
                        }
                    }
                    if ($kind) {
                        $rows[] = [...$base, 'kind' => $kind, 'key' => $lead->id.'-'.$kind];
                    }
                }
            });
        $thresholds = [];
        foreach ($amounts as $currency => $values) {
            if (count($values) >= 3) {
                sort($values, SORT_NUMERIC);
                $thresholds[$currency] = $values[(int) ceil(count($values) * .75) - 1];
            }
        }
        foreach ($rows as &$row) {
            if (isset($thresholds[$row['currency']]) && (float) $row['amount'] >= $thresholds[$row['currency']]) {
                $row['signals'][] = 'high_value';
                $row['score'] += 15;
                if (isset($row['fallback'])) {
                    $row['fallback']['score'] += 15;
                    $row['fallback']['signals'][] = 'high_value';
                }
            }
        }
        unset($row);
        return ['as_of' => $now->utc()->toISOString(), 'actions' => $rows];
    }

    private function facts(Inquiry $lead, CarbonImmutable $now): array
    {
        $data = $lead->custom_data ?? [];
        $guest = $lead->guest;
        $score = 0;
        $signals = [];
        $deadline = $data['project_deadline'] ?? $data['delivery_date'] ?? $data['deadline'] ?? null;
        $deadline = is_string($deadline) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $deadline, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $deadline : null;
        if ($deadline && $deadline >= $now->subDays(7)->toDateString() && $deadline <= $now->addDays(7)->toDateString()) {
            $signals[] = 'delivery_due';
            $score += $deadline <= $now->addDays(2)->toDateString() ? 55 : 30;
        }
        if (in_array(strtolower((string) $guest?->importance), ['vip','key','key account','high','strategic','critical'], true)
            || in_array(strtolower((string) $guest?->vip_level), ['vip','vvip','gold','platinum'], true)) {
            $signals[] = 'key_account';
            $score += 18;
        }
        if (in_array(strtolower((string) $lead->priority), ['urgent','high','critical'], true)) {
            $signals[] = 'high_priority';
            $score += 17;
        }
        $quantity = filter_var($data['order_quantity'] ?? $data['quantity'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($quantity >= 1000) {
            $signals[] = 'large_order';
            $score += 10;
        }
        $customerFields = $guest?->getAttribute('custom_data');
        if (is_string($customerFields)) {
            $customerFields = json_decode($customerFields, true);
        }
        $size = $customerFields['employee_count'] ?? $customerFields['company_size'] ?? $data['company_size'] ?? null;
        $size = is_scalar($size) ? mb_substr((string) $size, 0, 80) : null;
        if ((is_numeric($size) && (int) $size >= 250) || in_array(strtolower((string) $size), ['large', 'enterprise'], true)) {
            $signals[] = 'large_company';
            $score += 8;
        }

        return ['signals' => $signals, 'score' => $score, 'deadline' => $deadline, 'size' => $size, 'quantity' => $quantity ?: null];
    }
}
