<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReviewForm extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'type', 'is_active', 'is_default',
        'config', 'embed_key',
    ];

    protected $casts = [
        'config'     => 'array',
        'is_active'  => 'boolean',
        'is_default' => 'boolean',
    ];

    public function questions(): HasMany
    {
        return $this->hasMany(ReviewFormQuestion::class, 'form_id')->orderBy('order');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(ReviewSubmission::class, 'form_id');
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(ReviewInvitation::class, 'form_id');
    }
}
