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

    /**
     * Task 10 (admin editor — web address, publish, unpublish): the editor
     * shows the tenant's whole public address ("Web address", never
     * "slug") with a Copy button, and needs somewhere to get it from.
     * Nothing about the LANDING host — config('landing.host'), which
     * routes/landing.php binds the `landing.show` route's domain to — is
     * otherwise visible from the admin SPA's own origin, so this is
     * carried on the page itself rather than reimplemented client-side.
     *
     * Built off the named route, exactly the mechanism
     * LandingPageController::previewUrl() already uses for the SAME
     * domain-bound route group (`URL::temporarySignedRoute('landing.preview', ...)`),
     * so this is a single source of truth rather than a second,
     * hand-built scheme+host+path that could drift from the real one —
     * `route()` resolves `landing.show`'s bound domain regardless of
     * which host the CURRENT (admin) request arrived on.
     */
    protected $appends = ['url'];

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

    /**
     * The full public address this page is (or would be) served at, or
     * `null` for a row with no slug yet.
     *
     * Every REACHABLE caller today only ever serializes an already-saved
     * row — `slug` is a `NOT NULL UNIQUE` column
     * (2026_08_21_100000_create_landing_pages_table.php), and every admin
     * controller method here returns `$page->fresh()`/`fresh('sections')`
     * after a successful `save()`, or a freshly `validate()`d `store()`
     * payload where `slug` is `required`. The one model in this codebase
     * that legitimately has no slug — `LandingOnboardingService
     * ::probePage()`, an unsaved stand-in used only to ask `PageContent`
     * for counts — is never serialized to JSON.
     *
     * Guarded anyway: `route('landing.show', ['slug' => null])`
     * (confirmed empirically) throws `UrlGenerationException` rather than
     * returning something inert, because the route's `{slug}` segment is
     * required. `$appends` means this runs on EVERY future
     * `toArray()`/`toJson()` of this model, including call sites nobody
     * has written yet, so the guard is what keeps a slug-less row from
     * turning into a 500 in a context this comment cannot enumerate —
     * cheaper than trusting every future caller to have read this far.
     */
    public function getUrlAttribute(): ?string
    {
        return $this->slug ? route('landing.show', ['slug' => $this->slug]) : null;
    }
}
