<?php

namespace Tests\Feature\VoiceAlexa;

use Tests\TestCase;

class AlexaInteractionModelFileTest extends TestCase
{
    public function test_the_committed_interaction_model_matches_the_intents_the_skill_handles(): void
    {
        // Amazon only ever sees the file and the controller only ever sees the
        // class. If they drift, an Echo sends intents that are answered with help.
        $this->artisan('voice:alexa-model', ['--check' => true])->assertSuccessful();
    }
}
