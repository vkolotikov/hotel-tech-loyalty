<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class SpecialOfferFile extends Model
{
    use BelongsToOrganization;
    protected $guarded = ['id'];
    protected $hidden = ['content'];
}
