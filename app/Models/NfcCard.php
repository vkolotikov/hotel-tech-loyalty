<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NfcCard extends Model
{
    protected $fillable = [
        'member_id', 'uid', 'card_type', 'issued_at', 'issued_by',
        'last_scanned_at', 'last_scanned_by', 'scan_count', 'is_active', 'notes',
    ];

    protected $casts = [
        'issued_at' => 'datetime',
        'last_scanned_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function member() { return $this->belongsTo(LoyaltyMember::class, 'member_id'); }
    public function issuedBy() { return $this->belongsTo(User::class, 'issued_by'); }
}
