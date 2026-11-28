<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ContentMedia extends Model
{
    use BelongsToBrand, BelongsToOrganization;

    protected $table = 'content_media';

    protected $fillable = ['name', 'mime', 'size', 'url', 'archived', 'organization_id', 'brand_id'];

    protected $casts = ['archived' => 'boolean', 'size' => 'integer'];
}
