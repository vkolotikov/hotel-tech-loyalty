<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * A brand's event or note on the Plan (spec 2026-10-16 §3.1). The dates stay plain `Y-m-d` strings (no date cast:
 * SQLite would add a time); `end_date` is null for a one-day event and for every note.
 */
class ContentPlannerKeyDate extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const KINDS = ['note', 'event'];

    /** A brand keeps at most this many events and notes together. */
    public const MAX = 1000;

    /** An event lasts at most this many days, its first and last included. */
    public const MAX_EVENT_DAYS = 31;

    protected $fillable = ['planner_profile_id', 'brand_id', 'kind', 'title', 'details', 'start_date', 'end_date', 'created_by'];
}
