<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CorporateAccount extends Model
{
    protected $fillable = [
        'company_name', 'industry', 'tax_id', 'billing_address', 'billing_email',
        'contact_person', 'contact_email', 'contact_phone', 'account_manager',
        'contract_start', 'contract_end', 'negotiated_rate', 'rate_type',
        'discount_percentage', 'annual_room_nights_target', 'annual_room_nights_actual',
        'annual_revenue', 'payment_terms', 'credit_limit', 'status', 'notes',
    ];

    protected $casts = [
        'contract_start'      => 'date',
        'contract_end'        => 'date',
        'negotiated_rate'     => 'decimal:2',
        'discount_percentage' => 'decimal:2',
        'annual_revenue'      => 'decimal:2',
        'credit_limit'        => 'decimal:2',
    ];

    public function inquiries(): HasMany
    {
        return $this->hasMany(Inquiry::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class);
    }
}
