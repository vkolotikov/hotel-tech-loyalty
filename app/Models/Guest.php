<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToOrganization;

class Guest extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'salutation', 'first_name', 'last_name', 'full_name', 'email', 'phone', 'mobile',
        'company', 'position_title', 'guest_type', 'nationality', 'country', 'city',
        'address', 'postal_code', 'date_of_birth', 'passport_no', 'id_number',
        'vip_level', 'loyalty_tier', 'loyalty_id', 'preferred_language',
        'preferred_room_type', 'preferred_floor', 'dietary_preferences', 'special_needs',
        'email_consent', 'marketing_consent', 'consent_updated_at',
        'lead_source', 'owner_name', 'lifecycle_status', 'importance',
        'total_stays', 'total_nights', 'total_revenue', 'avg_daily_rate',
        'first_stay_date', 'last_stay_date', 'last_activity_at',
        'external_source', 'external_ref', 'email_key', 'phone_key', 'notes',
    ];

    protected $hidden = ['passport_no', 'id_number'];

    protected $appends = ['passport_masked', 'id_number_masked'];

    protected $casts = [
        'email_consent'    => 'boolean',
        'marketing_consent'=> 'boolean',
        'consent_updated_at' => 'datetime',
        'last_activity_at' => 'datetime',
        'date_of_birth'    => 'date',
        'first_stay_date'  => 'date',
        'last_stay_date'   => 'date',
        'total_revenue'    => 'decimal:2',
        'avg_daily_rate'   => 'decimal:2',
    ];

    public function getPassportMaskedAttribute(): ?string
    {
        if (!$this->passport_no) return null;
        $len = strlen($this->passport_no);
        if ($len <= 4) return str_repeat('*', $len);
        return str_repeat('*', $len - 4) . substr($this->passport_no, -4);
    }

    public function getIdNumberMaskedAttribute(): ?string
    {
        if (!$this->id_number) return null;
        $len = strlen($this->id_number);
        if ($len <= 4) return str_repeat('*', $len);
        return str_repeat('*', $len - 4) . substr($this->id_number, -4);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function inquiries(): HasMany
    {
        return $this->hasMany(Inquiry::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(GuestActivity::class)->orderByDesc('created_at');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(GuestTag::class, 'guest_tag_links', 'guest_id', 'tag_id')
            ->withPivot('created_at');
    }

    public function customValues(): HasMany
    {
        return $this->hasMany(GuestCustomValue::class);
    }

    /**
     * Auto-Bronze: every guest with an email is also a loyalty member from
     * day one. Fires after Guest::create from any path — booking widget,
     * chatbot capture, manual entry, importer, BookingEngineService — so
     * the admin only ever needs to look at "Members" to see all contacts.
     */
    protected static function booted(): void
    {
        static::created(function (Guest $guest) {
            // Default lifecycle to Prospect so the Members list can
            // distinguish form-fill leads from real customers.
            try {
                app(\App\Services\GuestLifecycleService::class)->initialize($guest);
            } catch (\Throwable $e) {
                \Log::warning('Guest lifecycle init failed', [
                    'guest_id' => $guest->id, 'error' => $e->getMessage(),
                ]);
            }

            if ($guest->member_id) return;
            if (empty($guest->email)) return;

            try {
                app(\App\Services\GuestMemberLinkService::class)->ensureMemberForGuest($guest);
            } catch (\Throwable $e) {
                \Log::warning('Guest auto-Bronze membership failed', [
                    'guest_id' => $guest->id, 'error' => $e->getMessage(),
                ]);
            }
        });
    }

    public static function normalizeEmailKey(?string $email): ?string
    {
        if (!$email) return null;
        return strtolower(trim($email));
    }

    public static function normalizePhoneKey(?string $phone): ?string
    {
        if (!$phone) return null;
        $digits = preg_replace('/\D/', '', $phone);
        return $digits ?: null;
    }
}
