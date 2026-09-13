<?php

namespace App\Voice\Alexa;

use App\Models\VoiceAlexaLink;
use Illuminate\Container\Attributes\Bind;

/**
 * Maps an Alexa request to the staff member it acts for. The internal pilot
 * pairs Echo accounts with portal codes; OAuth account linking becomes a
 * second implementation before any public launch.
 */
#[Bind(PairedAlexaAccountResolver::class)]
interface AlexaAccountResolver
{
    /** A live link whose staff member may act right now, or null. */
    public function resolve(array $payload): ?VoiceAlexaLink;
}
