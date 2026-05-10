<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * Admin-defined custom field. One row per (org × entity × key). Values
 * are stored on the entity itself in its `custom_data` jsonb column —
 * no values table, no joins.
 *
 * See migration 2026_05_10_130000_create_custom_fields for the
 * supported `entity` and `type` enums.
 */
class CustomField extends Model
{
    use BelongsToOrganization;

    public const ENTITIES = ['inquiry', 'guest', 'corporate_account', 'task'];

    public const TYPES = [
        'text', 'textarea', 'number', 'date',
        'select', 'multiselect', 'checkbox',
        'url', 'email', 'phone',
    ];

    protected $fillable = [
        'organization_id', 'entity',
        'key', 'label', 'type', 'config',
        'help_text', 'required', 'is_active',
        'show_in_list', 'sort_order',
    ];

    protected $casts = [
        'config'       => 'array',
        'required'     => 'boolean',
        'is_active'    => 'boolean',
        'show_in_list' => 'boolean',
        'sort_order'   => 'integer',
    ];
}
