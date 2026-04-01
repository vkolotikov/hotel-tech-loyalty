<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class RealtimeEvent extends Model
{
    use BelongsToOrganization;

    public $timestamps = false;

    protected $fillable = ['organization_id', 'type', 'title', 'body', 'data', 'created_at'];

    protected $casts = [
        'data'       => 'array',
        'created_at' => 'datetime',
    ];
}
