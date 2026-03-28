<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GuestSegment extends Model
{
    protected $fillable = ['name', 'filters'];

    protected $casts = ['filters' => 'array'];
}
