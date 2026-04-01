<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $fillable = [
        'name', 'slug', 'saas_org_id', 'widget_token', 'legal_name', 'tax_id', 'email', 'phone',
        'address', 'country', 'currency', 'timezone', 'logo_url',
        'website', 'settings', 'is_active',
    ];

    protected static function booted(): void
    {
        // Auto-generate widget_token on creation if column exists
        static::creating(function ($org) {
            if (empty($org->widget_token) && \Illuminate\Support\Facades\Schema::hasColumn('organizations', 'widget_token')) {
                $org->widget_token = \Illuminate\Support\Str::random(32);
            }
        });
    }

    protected $casts = [
        'settings'  => 'array',
        'is_active' => 'boolean',
    ];

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }
}
