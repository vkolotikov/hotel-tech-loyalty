<?php

namespace App\Services\Booking;

use App\Models\BookingRoom;
use App\Models\Service;
use Illuminate\Database\Eloquent\Builder;

/**
 * Can this organisation be booked online — one answer for every surface.
 *
 * The landing page's booking band, the member portal's "Book" tab and any
 * later caller must agree, or a member is offered a widget that says "no
 * times available" forever. So the precondition lives here once and is
 * exactly what ServiceSchedulingService enforces, nothing looser: at least
 * one active service linked to at least one active master who has at least
 * one active schedule row whose window is not empty.
 *
 * Every query runs withoutGlobalScopes(): a public landing request has no
 * bound tenant and TenantScope fails closed, so the organisation is named
 * explicitly instead.
 */
final class BookingCapability
{
    public function appointmentsBookable(int $orgId, ?int $brandId = null): bool
    {
        return Service::query()
            ->withoutGlobalScopes()
            ->where('services.organization_id', $orgId)
            // A row with brand_id NULL is "not assigned to any brand", not
            // "belongs to no brand's page" — the landing page's rule.
            ->when($brandId, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('services.brand_id', $brandId)->orWhereNull('services.brand_id')
            ))
            ->where('services.is_active', true)
            ->whereHas('masters', fn (Builder $masters) => $masters
                ->withoutGlobalScopes()
                ->where('service_masters.organization_id', $orgId)
                ->where('service_masters.is_active', true)
                ->whereHas('schedules', fn (Builder $rows) => $rows
                    ->withoutGlobalScopes()
                    ->where('service_master_schedules.is_active', true)
                    ->whereColumn('service_master_schedules.end_time', '>', 'service_master_schedules.start_time')))
            ->exists();
    }

    /** At least one active room to sell. The industry test belongs to the caller. */
    public function staysBookable(int $orgId): bool
    {
        return BookingRoom::query()
            ->withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->exists();
    }
}
