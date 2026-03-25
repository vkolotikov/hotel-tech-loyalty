<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $fillable = [
        'name', 'slug', 'legal_name', 'tax_id', 'email', 'phone',
        'address', 'country', 'currency', 'timezone', 'logo_url',
        'website', 'settings', 'is_active',
    ];

    protected $casts = [
        'settings'  => 'array',
        'is_active' => 'boolean',
    ];

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }
}
