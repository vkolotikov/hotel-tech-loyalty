<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $fillable = [
        'name', 'email', 'password', 'phone', 'date_of_birth',
        'nationality', 'language', 'avatar_url', 'user_type', 'organization_id',
        'wants_daily_summary', 'wants_loyalty_digest',
    ];

    protected $hidden = ['password', 'remember_token', 'email_verified_at', 'organization_id'];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'date_of_birth' => 'date',
        'password' => 'hashed',
        'wants_daily_summary' => 'boolean',
        'daily_summary_last_sent_at' => 'datetime',
        'wants_loyalty_digest' => 'boolean',
        'loyalty_digest_last_sent_at' => 'datetime',
    ];

    public function loyaltyMember()
    {
        return $this->hasOne(LoyaltyMember::class);
    }

    public function staff()
    {
        return $this->hasOne(Staff::class);
    }

    /**
     * The organisation this user belongs to.
     *
     * Industry Platform Plan Phase 6 — User does NOT use the
     * `BelongsToOrganization` trait (the trait defines the relation
     * for tenant-scoped child models; User is the tenant identity
     * model, so it doesn't tenant-scope itself). Before Phase 6 no
     * consumer needed `$user->organization` so the relation was
     * silently undefined — `$user?->organization?->resolved_industry`
     * always returned null and every industry-aware code path fell
     * through to the hotel default. DashboardController +
     * AnalyticsController::requireHotel + AiUsageController all read
     * via this accessor, so a single declaration unblocks every
     * industry-aware path at once.
     */
    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    /**
     * Brands this staff user can access. A user with NO rows in the pivot is
     * implicitly granted access to every brand in their organization (legacy
     * behaviour — no surprise downgrades for existing staff). The
     * BrandMiddleware honours this rule when resolving the current brand.
     */
    public function brands(): BelongsToMany
    {
        return $this->belongsToMany(Brand::class)
            ->withPivot('role')
            ->withTimestamps();
    }

    /**
     * Platform admin — the hotel-tech.ai operator(s) who own the platform
     * itself, not customers. Read from PLATFORM_ADMIN_EMAILS env (CSV).
     * Default ships with `info@hotel-tech.ai`.
     *
     * Used to bypass:
     *  - SubscriptionWall (no plan needed)
     *  - CheckSubscription middleware (no `subscription_required` 403)
     *  - RequireFeature middleware (every `feature:*` gate)
     *  - AuthController::subscription synthetic-features response
     *
     * NOT the same as staff.role='super_admin' — every org owner has
     * that role. Platform admin is a tiny allowlist of internal staff.
     */
    public function isPlatformAdmin(): bool
    {
        if (!$this->email) return false;
        $raw = config('services.saas.platform_admin_emails', '');
        $list = array_filter(array_map('trim', explode(',', (string) $raw)));
        return in_array(strtolower($this->email), array_map('strtolower', $list), true);
    }

    public function isStaff(): bool
    {
        return $this->user_type === 'staff';
    }

    public function isMember(): bool
    {
        return $this->user_type === 'member';
    }
}
