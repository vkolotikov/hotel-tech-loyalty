<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Internal provider identity; all callers explicitly scope organization/member or authenticate a pass token. */
class WalletPass extends Model
{
    protected $guarded = ['id'];
    protected $hidden = ['authentication_token'];
    protected $casts = [
        'authentication_token' => 'encrypted', 'revision' => 'integer', 'attempts' => 'integer',
        'next_attempt_at' => 'datetime', 'last_success_at' => 'datetime',
    ];
}
