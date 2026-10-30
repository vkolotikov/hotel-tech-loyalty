<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WalletRegistration extends Model
{
    protected $guarded = ['id'];
    protected $hidden = ['push_token', 'device_hash'];
    protected $casts = ['push_token' => 'encrypted'];
}
