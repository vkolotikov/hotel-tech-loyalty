<?php

namespace Tests\Unit\Voice;

use App\Voice\Alexa\AlexaResponse;
use PHPUnit\Framework\TestCase;

class AlexaResponseTest extends TestCase
{
    public function test_speech_has_alexas_response_shape(): void
    {
        $response = AlexaResponse::speak('You have two leads today.');

        $this->assertSame('1.0', $response['version']);
        $this->assertSame(['type' => 'PlainText', 'text' => 'You have two leads today.'],
            $response['response']['outputSpeech']);
        $this->assertFalse($response['response']['shouldEndSession']);
        $this->assertArrayNotHasKey('reprompt', $response['response']);
    }

    public function test_a_session_can_end_or_reprompt(): void
    {
        $this->assertTrue(AlexaResponse::speak('Goodbye.', endSession: true)['response']['shouldEndSession']);

        $asked = AlexaResponse::speak('Which one?', reprompt: 'Which customer do you mean?');
        $this->assertSame(['type' => 'PlainText', 'text' => 'Which customer do you mean?'],
            $asked['response']['reprompt']['outputSpeech']);
    }

    public function test_long_speech_is_cut_at_a_sentence_boundary_within_alexas_limit(): void
    {
        $sentence = str_repeat('word ', 30).'end.';
        $spoken = AlexaResponse::speak(str_repeat($sentence.' ', 80))['response']['outputSpeech']['text'];

        $this->assertLessThanOrEqual(AlexaResponse::MAX_SPEECH_CHARACTERS, mb_strlen($spoken));
        $this->assertStringEndsWith('end.', $spoken, 'A cut must not end mid-sentence.');
    }

    public function test_speech_without_any_sentence_break_is_still_capped(): void
    {
        $spoken = AlexaResponse::speak(str_repeat('a', 9000))['response']['outputSpeech']['text'];

        $this->assertSame(AlexaResponse::MAX_SPEECH_CHARACTERS, mb_strlen($spoken));
    }

    public function test_blank_speech_never_produces_silence(): void
    {
        $spoken = AlexaResponse::speak("  \n ")['response']['outputSpeech']['text'];

        $this->assertNotSame('', trim($spoken));
    }

    public function test_the_empty_response_acknowledges_a_session_end(): void
    {
        $this->assertSame('{"version":"1.0","response":{}}', json_encode(AlexaResponse::empty()));
    }
}
