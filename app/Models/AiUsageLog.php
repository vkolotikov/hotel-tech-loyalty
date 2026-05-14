<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * One row per AI provider call. Append-only — never updated, never deleted
 * (except by retention pruning). See AiUsageService for the write path.
 */
class AiUsageLog extends Model
{
    use BelongsToOrganization;

    public $timestamps = false;

    protected $fillable = [
        'organization_id', 'brand_id', 'user_id', 'model', 'kind',
        'feature', 'input_tokens', 'output_tokens', 'cost_cents', 'created_at',
    ];

    protected $casts = [
        'created_at'    => 'datetime',
        'input_tokens'  => 'integer',
        'output_tokens' => 'integer',
        'cost_cents'    => 'integer',
    ];
}
