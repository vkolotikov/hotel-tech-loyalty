<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A button on a link-in-bio page (spec 2026-10-19 §6.2): a label and a tracked link, in `position` order. */
class ContentBioButton extends Model
{
    public $timestamps = false;

    protected $fillable = ['bio_page_id', 'link_id', 'label', 'position'];

    public function link(): BelongsTo
    {
        return $this->belongsTo(ContentLink::class, 'link_id');
    }
}
