<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class SpecialOfferSend extends Model
{
    use BelongsToOrganization;
    protected $guarded = ['id'];
    protected $hidden = ['attachment_content', 'snapshot', 'member_ids', 'portal_ids'];
    protected $casts = ['member_ids' => 'array', 'portal_ids' => 'array', 'snapshot' => 'array', 'counts' => 'array', 'portal_done' => 'boolean'];
}
