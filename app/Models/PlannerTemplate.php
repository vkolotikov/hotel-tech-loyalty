<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * Org-wide task template. Replaces the old localStorage-based per-
 * browser template list so a template authored on one workstation is
 * available to every user in the org.
 *
 * `name` is the picker label. The remaining fields are the values
 * that get pre-filled into a fresh PlannerTask when the template is
 * applied. `category` is purely a UX grouping in the picker.
 */
class PlannerTemplate extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'name', 'title',
        'task_group', 'task_category',
        'priority', 'duration_minutes',
        'description', 'category', 'sort_order',
    ];

    protected $casts = [
        'duration_minutes' => 'integer',
        'sort_order'       => 'integer',
    ];
}
