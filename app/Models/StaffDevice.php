<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A phone a staff member signed in to with the HexaTech Staff app (`StaffAlerts`). Not tenant-scoped: a token is
 * unique across every organisation, so registering looks it up everywhere, and every other read names its
 * organisation itself.
 */
class StaffDevice extends Model
{
    public const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    protected $fillable = ['organization_id', 'user_id', 'app', 'token', 'platform', 'language', 'alerts', 'last_seen_at'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return [
            'alerts'       => 'boolean',
            'last_seen_at' => 'datetime',
        ];
    }
}
