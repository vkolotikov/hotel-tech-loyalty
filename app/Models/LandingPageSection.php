<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LandingPageSection extends Model
{
    /**
     * `tone` is NOT fillable, deliberately. The column still exists
     * (2026_08_31_090000_add_tone_to_landing_page_sections) but it was the
     * generic house design's per-band colour, and that design is retired
     * and deleted: none of the six kit layouts reads it, no endpoint
     * validates it, and no screen offers it. Leaving the column is the safe
     * direction on the live table; leaving a writer for a column nothing
     * reads is not, so the writer went with the design.
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
