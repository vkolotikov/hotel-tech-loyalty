<?php

namespace App\Voice\Alexa;

use App\Models\VoiceAlexaLink;
use App\OAuth\PluginIdentity;

class PairedAlexaAccountResolver implements AlexaAccountResolver
{
    public function resolve(array $payload): ?VoiceAlexaLink
    {
        $alexaUserId = data_get($payload, 'context.System.user.userId')
            ?? data_get($payload, 'session.user.userId');

        if (! is_string($alexaUserId) || $alexaUserId === '') {
            return null;
        }

        $link = VoiceAlexaLink::query()->live()
            ->where('alexa_user_hash', VoiceAlexaLink::hashFor($alexaUserId))
            ->with('user')
            ->first();

        // PluginIdentity::active() is exactly what CustomerBookingAccess::authorize()
        // demands of every tool call, so refusing here gives an early, spoken
        // answer instead of a tool error in the middle of one. A staff member
        // who has moved organization no longer matches the link they made.
        if ($link === null || ! PluginIdentity::active($link->user)
            || (int) $link->user->organization_id !== (int) $link->organization_id) {
            return null;
        }

        return $link;
    }
}
