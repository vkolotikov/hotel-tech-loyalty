<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/** The same set of won enquiries powers the list, its figures and both export formats. */
final class DealListQuery
{
    /**
     * @param Builder<Inquiry> $query
     * @return Builder<Inquiry>
     */
    public static function deals(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNotNull('fulfillment_stage')
            ->orWhere('status', 'Confirmed')->orWhereHas('pipelineStage', fn (Builder $s) => $s->where('kind', 'won')));
    }

    /**
     * @param Builder<Inquiry> $query
     * @return Builder<Inquiry>
     */
    public static function active(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNull('fulfillment_stage')->orWhere('fulfillment_stage', '!=', 'completed'));
    }

    /**
     * @param Builder<Inquiry> $query
     * @return Builder<Inquiry>
     */
    public static function unpaid(Builder $query): Builder
    {
        return self::active($query)->where(fn (Builder $q) => $q->whereNull('payment_status')
            ->orWhereIn('payment_status', ['pending', 'invoice_sent', 'partial']));
    }

    /**
     * @param Builder<Inquiry> $query
     * @return Builder<Inquiry>
     */
    public static function completedThisMonth(Builder $query): Builder
    {
        $now = CarbonImmutable::now(VenueClock::zone((int) app('current_organization_id')));
        return $query->where('fulfillment_stage', 'completed')->whereBetween('fulfillment_completed_at', [$now->startOfMonth()->utc(), $now->utc()]);
    }

    /**
     * @param Builder<Inquiry> $query
     * @return Builder<Inquiry>
     */
    public static function apply(Builder $query, Request $request): Builder
    {
        self::deals($query);
        $search = trim($request->string('search')->toString());
        if ($search !== '') SalesRecordSearch::inquiries($query, $search);
        foreach (['stage' => 'fulfillment_stage', 'payment' => 'payment_status', 'property_id' => 'property_id', 'owner' => 'assigned_to'] as $key => $column) {
            if ($request->filled($key)) $query->where($column, $request->input($key));
        }
        match ($request->input('focus')) {
            'active' => self::active($query),
            'unpaid' => self::unpaid($query),
            'completed_month' => self::completedThisMonth($query),
            'overdue' => $query->where('next_task_completed', false)->where('next_task_due', '<', VenueClock::today((int) app('current_organization_id'))),
            'high_value' => self::active($query)->where('total_value', '>=', 500),
            default => null,
        };
        match ($request->input('sort')) {
            'amount' => $query->orderByRaw('total_value IS NULL')->orderByDesc('total_value'),
            'created' => $query->orderByDesc('created_at'),
            default => $query->orderByRaw('CASE WHEN next_task_completed OR next_task_due IS NULL THEN 1 ELSE 0 END')
                ->orderByRaw('CASE WHEN NOT COALESCE(next_task_completed, false) THEN next_task_due END ASC'),
        };
        return $query->orderByDesc('id');
    }
}
