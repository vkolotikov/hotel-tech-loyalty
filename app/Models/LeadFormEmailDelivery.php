<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class LeadFormEmailDelivery extends Model
{
    use BelongsToOrganization;

    protected $guarded = ['id'];

    protected $casts = [
        'expires_at' => 'immutable_datetime',
        'attempted_at' => 'immutable_datetime',
        'sent_at' => 'immutable_datetime',
        'unsubscribed_at' => 'immutable_datetime',
    ];
}
