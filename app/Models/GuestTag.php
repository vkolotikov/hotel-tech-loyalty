<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class GuestTag extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['organization_id', 'name', 'color'];
}
