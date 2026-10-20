<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/** An article or page a scan found (spec 2026-10-20 §3.4). */
class ContentSitePage extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'site_id', 'url', 'url_hash', 'kind', 'title', 'description', 'image_url',
        'picture_url', 'picture_source', 'published_at', 'language', 'body', 'last_seen_at',
    ];

    protected $casts = ['published_at' => 'datetime', 'last_seen_at' => 'datetime'];

    /** A promotion post's `utm_campaign` (spec §D11): `promote-` and the address's last part, else the title. */
    public function campaignName(): string
    {
        $segments = array_values(array_filter(explode('/', (string) parse_url((string) $this->url, PHP_URL_PATH)), fn (string $s) => $s !== ''));
        $last = $segments === [] ? '' : (string) preg_replace('/\.(html?|php|aspx?)$/i', '', rawurldecode($segments[count($segments) - 1]));
        $slug = Str::slug($last) ?: Str::slug((string) $this->title) ?: 'website';

        return 'promote-' . rtrim(mb_substr($slug, 0, 50), '-');
    }
}
