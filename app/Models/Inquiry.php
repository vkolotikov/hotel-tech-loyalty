<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Scopes\BrandScope;
use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;

class Inquiry extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /**
     * Override implicit route binding so admin routes resolve an
     * inquiry regardless of the active brand context.
     *
     * Inquiries are org-scoped with brand attribution (see CLAUDE.md
     * → Multi-Brand) — the `brand_id` column is for reporting and
     * UI badge tinting, not access control. Org safety is provided
     * by TenantScope which still applies here. Without this override
     * `/v1/admin/inquiries/{inquiry}` 404s for any inquiry whose
     * brand_id differs from the SPA's current brand selector — a
     * confusing failure mode for cancel/convert/edit flows.
     */
    public function resolveRouteBinding($value, $field = null)
    {
        return static::withoutGlobalScope(BrandScope::class)
            ->where($field ?? $this->getRouteKeyName(), $value)
            ->first() ?? abort(404);
    }

    protected $fillable = [
        'organization_id', 'brand_id', 'guest_id', 'corporate_account_id', 'property_id', 'inquiry_type', 'source',
        'check_in', 'check_out', 'num_nights', 'num_rooms', 'num_adults', 'num_children',
        'room_type_requested', 'rate_offered', 'total_value', 'status', 'priority',
        'assigned_to', 'special_requests',
        'event_type', 'event_name', 'event_pax', 'function_space', 'catering_required', 'av_required',
        'next_task_type', 'next_task_due', 'next_task_notes', 'next_task_completed',
        'phone_calls_made', 'emails_sent', 'last_contacted_at', 'last_contact_comment', 'notes',
        // CRM Phase 1 — pipeline + lost-reason FKs and AI Smart Panel cache.
        // The legacy `status` text column is kept and mirrored to
        // pipeline_stage_id so old code paths keep working.
        'pipeline_id', 'pipeline_stage_id', 'lost_reason_id',
        'ai_brief', 'ai_brief_at', 'ai_intent',
        'ai_win_probability', 'ai_going_cold_risk', 'ai_suggested_action',
        // CRM Phase 7 — admin-defined custom fields, stored as jsonb.
        // Schema lives in the custom_fields table (entity='inquiry').
        'custom_data',
        // CRM Phase 10 — link to the lead-capture form that created
        // this inquiry, so the funnel report can attribute leads.
        'lead_form_id',
        // Deals & Fulfillment (2026-05-15) — once an inquiry is won, it
        // walks a fulfillment workflow tracked on the same row.
        'fulfillment_stage', 'payment_status', 'paid_amount',
        'fulfillment_started_at', 'fulfillment_completed_at',
    ];

    protected $casts = [
        'check_in'                  => 'date',
        'check_out'                 => 'date',
        'next_task_due'             => 'date',
        'last_contacted_at'         => 'date',
        'next_task_completed'       => 'boolean',
        'catering_required'         => 'boolean',
        'av_required'               => 'boolean',
        'rate_offered'              => 'decimal:2',
        'total_value'               => 'decimal:2',
        // CRM Phase 1 casts
        'ai_brief_at'               => 'datetime',
        'ai_win_probability'        => 'integer',
        'custom_data'               => 'array',
        // Deals & Fulfillment casts
        'paid_amount'               => 'decimal:2',
        'fulfillment_started_at'    => 'datetime',
        'fulfillment_completed_at'  => 'datetime',
    ];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    /* ─── CRM Phase 1 relations ────────────────────────────────────── */

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }

    public function pipelineStage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class);
    }

    public function lostReason(): BelongsTo
    {
        return $this->belongsTo(InquiryLostReason::class, 'lost_reason_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class)->orderByDesc('occurred_at');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->orderBy('due_at');
    }

    /** Open tasks only — what shows on the lead detail's Tasks panel. */
    public function openTasks(): HasMany
    {
        return $this->hasMany(Task::class)->whereNull('completed_at')->orderBy('due_at');
    }

    public function corporateAccount(): BelongsTo
    {
        return $this->belongsTo(CorporateAccount::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class);
    }
}
