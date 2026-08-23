<?php
namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LandingPage extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const STATUS_DRAFT     = 'draft';
    public const STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'organization_id', 'brand_id', 'slug', 'template_key', 'industry',
        'status', 'published_at', 'first_published_at', 'theme', 'content', 'seo',
    ];

    protected $casts = [
        'theme'              => 'array',
        'content'            => 'array',
        'seo'                => 'array',
        'published_at'       => 'datetime',
        'first_published_at' => 'datetime',
    ];

    public function sections(): HasMany
    {
        return $this->hasMany(LandingPageSection::class)->orderBy('sort');
    }

    public function scopePublished($query)
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }
}
