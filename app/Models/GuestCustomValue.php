<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GuestCustomValue extends Model
{
    protected $fillable = ['guest_id', 'field_id', 'value'];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function field(): BelongsTo
    {
        return $this->belongsTo(GuestCustomField::class, 'field_id');
    }
}
