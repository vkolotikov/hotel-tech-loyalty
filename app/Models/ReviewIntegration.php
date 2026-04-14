<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ReviewIntegration extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'platform', 'display_name',
        'write_review_url', 'place_id', 'is_enabled',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
    ];
}
