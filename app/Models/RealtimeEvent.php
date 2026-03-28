<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RealtimeEvent extends Model
{
    public $timestamps = false;

    protected $fillable = ['type', 'title', 'body', 'data', 'created_at'];

    protected $casts = [
        'data'       => 'array',
        'created_at' => 'datetime',
    ];
}
