<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LandingPageSection extends Model
{
    /**
     * `tone` is nullable and stays that way: null is not "unset", it is the
     * value that means "render this band the way its partial was authored"
     * — see App\Landing\SectionType::bandClass(). Never given a cast: it is
     * a plain string id from SectionType::TONES, and the renderer
     * re-whitelists it at read time regardless of what reached the column.
     */
    protected $fillable = ['landing_page_id', 'key', 'enabled', 'tone', 'sort', 'content'];

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
