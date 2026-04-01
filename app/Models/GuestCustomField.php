<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class GuestCustomField extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['organization_id', 'field_name', 'field_type', 'sort_order'];
}
