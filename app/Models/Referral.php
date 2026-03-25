<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Referral extends Model
{
    protected $fillable = [
        'referrer_id', 'referee_id', 'status',
        'referrer_points_awarded', 'referee_points_awarded',
        'qualified_at', 'rewarded_at',
    ];

    protected $casts = [
        'qualified_at' => 'datetime',
        'rewarded_at' => 'datetime',
    ];

    public function referrer() { return $this->belongsTo(LoyaltyMember::class, 'referrer_id'); }
    public function referee() { return $this->belongsTo(LoyaltyMember::class, 'referee_id'); }
}
