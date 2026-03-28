<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GuestCustomField extends Model
{
    protected $fillable = ['field_name', 'field_type', 'sort_order'];
}
