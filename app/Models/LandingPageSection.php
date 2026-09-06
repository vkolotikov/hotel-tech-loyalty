<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LandingPageSection extends Model
{
    /**
     * There is no `tone` here, deliberately. It was the generic house
     * design's per-band colour (2026_08_31_090000_add_tone_to_landing_page_sections);
     * that design was retired and deleted with everything that read it, the
     * writer went with the design, and the column itself was dropped by
     * 2026_09_06_190000_drop_tone_from_landing_page_sections once nothing
     * could reach it.
     */
    protected $fillable = ['landing_page_id', 'key', 'enabled', 'sort', 'content'];

    protected $casts = [
        'enabled' => 'boolean',
        'sort'    => 'integer',
        'content' => 'array',
    ];

    public function page(): BelongsTo
    {
        return $this->belongsTo(LandingPage::class, 'landing_page_id');
    }
}
