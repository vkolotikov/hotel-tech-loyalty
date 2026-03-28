<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GuestActivity extends Model
{
    protected $fillable = ['guest_id', 'type', 'description', 'performed_by'];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }
}
