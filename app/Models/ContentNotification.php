<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** One explicit recipient/event identity. Email consent is independent of keeping in-app news. */
class ContentNotification extends Model
{
    use BelongsToBrand, BelongsToOrganization;

    public const UPDATED_AT = null;
    protected $dateFormat = 'Y-m-d H:i:s.u';
    protected $guarded = ['id'];
    protected $casts = ['recipient_id' => 'integer', 'email_attempted_at' => 'datetime'];
}
