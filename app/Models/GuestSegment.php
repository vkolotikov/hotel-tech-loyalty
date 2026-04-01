<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class GuestSegment extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['organization_id', 'name', 'filters'];

    protected $casts = ['filters' => 'array'];
}
