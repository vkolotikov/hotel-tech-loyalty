<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ContentWork extends Model
{
    use BelongsToBrand, BelongsToOrganization;

    protected $table = 'content_work';

    protected $guarded = ['id'];

    protected $hidden = ['input', 'owner', 'post_revision', 'request_key'];

    protected $casts = ['input' => 'array', 'result' => 'array', 'started_at' => 'datetime', 'finished_at' => 'datetime', 'cancelled_at' => 'datetime'];
}
