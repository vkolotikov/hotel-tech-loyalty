<?php

namespace App\Services\Crm;

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
use Illuminate\Support\Facades\DB;

final class TeamDashboard
{
    public function __construct(private TeamEmailThreads $threads, private TeamPriorityReview $review) {}

    public function for(Organization $org, User $user, string $period, string $filter, int $page, int $size): array
    {
        $orgId = (int) $org->id;
        $access = CrmBrands::for($user);
        $selected = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $visible = Inquiry::query()->where('organization_id', $orgId);
        if (!$access['all']) {
            $visible->whereIntegerInRaw('brand_id', array_column($access['brands'], 'id'));
        }
        $mail = $orgId === CrmMail::ORGANIZATION && app(CrmMail::class)->available($user);
        $scope = hash('sha256', json_encode([$orgId, $selected, $access['all'], array_column($access['brands'], 'id'), $mail]));
        $now = CarbonImmutable::now(VenueClock::zone($orgId));
        $start = $period === 'month' ? $now->startOfMonth() : $now->startOfWeek(CarbonImmutable::MONDAY);
        $cache = SharedCache::store();
        $key = 'crm:team:v1:'.$scope.':'.$now->toDateString();
        $snapshot = $cache->remember($key, 45, fn () => $this->queue($visible, $org, $now, $mail));
        $series = $cache->remember($key.':'.$period, 45, fn () => $this->series($visible, $start, $now, $orgId));
        [$actions, $reviewed] = $this->review->rank($snapshot['actions'], $org, $user, $selected, $scope);
        $emails = array_filter($actions, fn ($row) => $row['kind'] === 'email');
        $filtered = array_values(array_filter($actions, fn ($row) => $filter === 'all' || $row['kind'] === $filter));
        $pages = max(1, (int) ceil(count($filtered) / $size));
        $page = min($pages, $page);
        $rows = array_slice($filtered, ($page - 1) * $size, $size);
        foreach ($rows as &$row) {
            unset($row['evidence'], $row['score'], $row['review_key'], $row['guest_id'], $row['brand_id']);
        }
        unset($row);

        return [
            'period' => $period, 'from' => $start->toDateString(), 'through' => $now->toDateString(), 'as_of' => $snapshot['as_of'],
            'leads' => array_sum(array_column($series['days'], 'leads')), 'wins' => array_sum(array_column($series['days'], 'wins')),
            'undated_wins' => $series['undated'], 'days' => $series['days'], 'emails' => count($emails),
            'period_emails' => count(array_filter($emails, fn ($r) => $r['at'] >= $start->timestamp)),
            'actions_total' => count($actions), 'reviewed' => $reviewed, 'page' => $page, 'pages' => $pages,
            'matching' => count($filtered), 'actions' => $rows,
        ];
    }

    /** @param Builder<Inquiry> $visible */
    private function series(Builder $visible, CarbonImmutable $start, CarbonImmutable $now, int $orgId): array
    {
        $days = [];
        for ($day = $start; $day->lte($now); $day = $day->addDay()) {
            $key = $day->toDateString();
            $days[$key] = ['date' => $key, 'leads' => 0, 'wins' => 0];
        }
        $range = [$start->utc(), $now->utc()];
        $leads = (clone $visible)->whereBetween('created_at', $range)->toBase()->select('created_at')->cursor();
        foreach ($leads as $lead) {
            $days[CarbonImmutable::parse($lead->created_at, 'UTC')->setTimezone($now->timezone)->toDateString()]['leads']++;
        }
        // Only a dated win is a win in a particular interval. Later edits or fulfilment dates cannot date an old sale.
        $wins = DB::table('activities as a')->joinSub((clone $visible)->select(['id', 'brand_id']), 'i', 'i.id', '=', 'a.inquiry_id')
            ->where('a.organization_id', $orgId)->where(fn ($q) => $q->whereNull('a.brand_id')->orWhereColumn('a.brand_id', 'i.brand_id'))
            ->where('a.type', 'status_change')->where('a.metadata->kind', 'won')->whereNotNull('a.occurred_at')
            ->groupBy('a.inquiry_id')->selectRaw('a.inquiry_id, MIN(a.occurred_at) AS won_at');
        $recorded = DB::query()->fromSub(clone $wins, 'wins')->whereBetween('won_at', $range)->cursor();
        foreach ($recorded as $win) {
            $days[CarbonImmutable::parse($win->won_at, 'UTC')->setTimezone($now->timezone)->toDateString()]['wins']++;
        }
        $undated = (clone $visible)->where(fn ($q) => $q->where('status', 'Confirmed')->orWhereHas('pipelineStage', fn ($s) => $s->where('kind', 'won')))
            ->whereNotIn('id', DB::query()->fromSub($wins, 'wins')->select('inquiry_id'))->count();

        return ['days' => array_values($days), 'undated' => $undated];
    }

    /** @param Builder<Inquiry> $visible */
    private function queue(Builder $visible, Organization $org, CarbonImmutable $now, bool $mail): array
    {
        $rows = $amounts = [];
        $venueCurrency = PortalBootstrap::currency($org);
        (clone $visible)->with(['guest:id,organization_id,full_name,company,email,importance,vip_level,custom_data', 'pipelineStage:id,kind'])
            ->select(['id', 'organization_id', 'brand_id', 'guest_id', 'pipeline_stage_id', 'status', 'priority', 'assigned_to', 'total_value', 'currency',
                'custom_data', 'next_task_completed', 'next_task_due', 'last_contacted_at', 'fulfillment_stage', 'created_at', 'notes', 'special_requests'])
            ->chunkById(200, function ($leads) use (&$rows, &$amounts, $org, $now, $mail, $venueCurrency) {
                $threads = $this->threads->heads($leads, (int) $org->id, $mail);
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
                        'score' => $facts['score'], 'at' => $lead->created_at->timestamp ?? 0, 'source' => null, 'message_id' => null, 'subject' => '',
                        'evidence' => ['account' => $profiles->get($lead->guest_id, ''),
                            'request' => mb_substr(trim((string) $lead->special_requests.' '.(string) $lead->notes), 0, 750),
                            'size' => $facts['size']],
                    ];
                    $pending = false;
                    foreach ($heads as $key => $head) {
                        if ($head['direction'] !== 'inbound') {
                            continue;
                        }
                        $pending = true;
                        $wait = max(0, intdiv($now->timestamp - $head['at'], 3600));
                        $row = array_replace($base, ['kind' => 'email', 'key' => $lead->id.'-email-'.$key, 'source' => $head['source'],
                            'message_id' => $head['id'], 'subject' => $head['subject'], 'at' => $head['at']]);
                        $row['score'] += 30 + min(16, intdiv($wait, 12));
                        if ($wait >= 48) {
                            $row['signals'][] = 'waiting';
                        }
                        $rows[] = $row;
                    }
                    if ($pending) {
                        continue;
                    }
                    $due = $lead->next_task_due?->toDateString();
                    $delivery = in_array('delivery_due', $base['signals'], true) && !in_array(strtolower((string) $lead->fulfillment_stage), ['completed','delivered','cancelled'], true);
                    if ($delivery && ($open || $lead->status === 'Confirmed' || $lead->pipelineStage?->kind === 'won')) {
                        $kind = 'delivery';
                    } elseif ($open && !$lead->next_task_completed && $due && $due <= $now->toDateString()) {
                        $kind = 'followup';
                        $base['signals'][] = $due < $now->toDateString() ? 'overdue' : 'due_today';
                        $base['score'] += $due < $now->toDateString() ? 32 : 24;
                    } elseif ($open && !$heads && !$lead->last_contacted_at && $lead->created_at?->gte($now->subDays(7))
                        && in_array(strtolower(trim((string) $lead->status)), ['new', 'new enquiry', 'new inquiry', ''], true)) {
                        $kind = 'new';
                        $base['score'] += 15;
                    } else {
                        continue;
                    }
                    $rows[] = [...$base, 'kind' => $kind, 'key' => $lead->id.'-'.$kind];
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
