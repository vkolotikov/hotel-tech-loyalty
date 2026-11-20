<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class LoyaltyCardBatch extends Model
{
    use BelongsToOrganization;

    protected $fillable = ['organization_id', 'first_number', 'last_number', 'card_count'];

    protected $casts = ['card_count' => 'integer'];
}
