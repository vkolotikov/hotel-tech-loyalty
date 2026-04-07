<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatMessageFeedback extends Model
{
    use BelongsToOrganization;

    protected $table = 'chat_message_feedback';

    protected $fillable = [
        'organization_id',
        'message_id',
        'user_id',
        'rating',
        'comment',
        'applied_to_training',
    ];

    protected $casts = [
        'applied_to_training' => 'boolean',
    ];

    public function message()
    {
        return $this->belongsTo(ChatMessage::class, 'message_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
