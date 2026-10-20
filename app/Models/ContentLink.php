<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * A tracked short link (spec 2026-10-19 §5): a post's Link or a link-in-bio button. `destination` null = switched off.
 * A public request has no tenant: the public host reads it with withoutGlobalScopes(), by code.
 */
class ContentLink extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = ['organization_id', 'brand_id', 'post_id', 'code', 'destination', 'utm'];

    protected $casts = ['utm' => 'array'];
}
