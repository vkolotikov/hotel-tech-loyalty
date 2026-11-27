<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use App\Models\Organization;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

final class TeamCustomers
{
    public function __construct(private TeamPerformance $performance, private OpenLeadValue $valuation) {}

    /** @param Builder<Inquiry> $visible */
    public function ranking(Builder $visible, Organization $org, ?CarbonImmutable $since, CarbonImmutable $now): array
    {
        $wins = $this->performance->firstWins($visible, (int) $org->id);
        $deals = (clone $visible)->leftJoinSub($wins, 'w', 'w.inquiry_id', '=', 'inquiries.id');
        if ($since) {
            $deals->whereBetween('w.won_at', [$since->utc(), $now->utc()]);
        } else {
            $deals->where(fn ($q) => $q->where('w.won_at', '<=', $now->utc())->orWhere(fn ($legacy) => $legacy
                ->whereNull('w.won_at')->where(fn ($status) => $status->where('status', 'Confirmed')->orWhereHas('pipelineStage', fn ($s) => $s->where('kind', 'won')))));
        }
        $scoped = $deals->select(['inquiries.organization_id','inquiries.brand_id','inquiries.corporate_account_id','inquiries.guest_id','inquiries.currency','inquiries.total_value']);
        $groups = DB::query()->fromSub($scoped, 'd')
            ->leftJoin('corporate_accounts as c', fn ($j) => $j->on('c.id', '=', 'd.corporate_account_id')->on('c.organization_id', '=', 'd.organization_id'))
            ->leftJoin('guests as g', fn ($j) => $j->on('g.id', '=', 'd.guest_id')->on('g.organization_id', '=', 'd.organization_id')->whereNull('c.id'))
            ->where(fn ($q) => $q->whereNotNull('c.id')->orWhereNotNull('g.id'))
            ->groupBy('d.organization_id','d.brand_id','d.currency','c.id','c.company_name','g.id','g.full_name','g.company')
            ->select(['d.organization_id','d.brand_id','d.currency','c.id as company_id','c.company_name','g.id as contact_id','g.full_name','g.company'])
            ->selectRaw('count(*) as wins, count(case when d.total_value <> 0 then 1 end) as leads, sum(d.total_value) as amount')->get();
        $customers = $sets = [];
        foreach ($groups as $group) {
            $type = $group->company_id ? 'company' : 'contact';
            $id = (int) ($group->company_id ?? $group->contact_id);
            $key = $type.'-'.$id;
            $sets[$key][] = $group;
            $customers[$key] ??= ['type' => $type, 'id' => $id, 'name' => trim((string) ($group->company_name ?? $group->full_name)),
                'company' => trim((string) $group->company), 'wins' => 0];
            $customers[$key]['wins'] += (int) $group->wins;
        }
        foreach ($this->valuation->summaries($sets, $org) as $key => $value) {
            $valued = array_sum(array_column(array_filter($value['groups'], fn ($g) => $g['included']), 'count'));
            $customers[$key] += ['amount' => $valued ? $value['amount'] : null, 'currency' => $value['currency'], 'converted' => $value['converted'], 'valued' => $valued];
        }
        usort($customers, static function ($a, $b) {
            $order = ($b['amount'] !== null) <=> ($a['amount'] !== null);
            if (!$order && $a['amount'] !== null) {
                $order = BigDecimal::of($b['amount'])->compareTo($a['amount']);
            }
            return $order ?: $b['wins'] <=> $a['wins'] ?: strcasecmp($a['name'], $b['name']) ?: strcmp($a['type'], $b['type']) ?: $a['id'] <=> $b['id'];
        });

        return ['as_of' => $now->utc()->toISOString(), 'total' => count($customers), 'rows' => array_slice($customers, 0, 4)];
    }
}
