<?php

namespace App\Voice\Alexa;

use stdClass;

/**
 * Builds Alexa custom-skill responses. PlainText only: SSML would require
 * escaping every model-written character, and nothing here needs prosody.
 */
final class AlexaResponse
{
    /** Alexa rejects outputSpeech longer than this. */
    public const MAX_SPEECH_CHARACTERS = 8000;

    /** Silence is indistinguishable from a broken skill to someone listening. */
    private const SILENCE_FALLBACK = 'Sorry, I have nothing to say to that.';

    public static function speak(string $text, bool $endSession = false, ?string $reprompt = null): array
    {
        $response = [
            'outputSpeech' => self::plainText($text),
            'shouldEndSession' => $endSession,
        ];

        // A reprompt only means something while the session stays open.
        if ($reprompt !== null && ! $endSession) {
            $response['reprompt'] = ['outputSpeech' => self::plainText($reprompt)];
        }

        return ['version' => '1.0', 'response' => $response];
    }

    /** The body for a SessionEndedRequest, which must not carry speech. */
    public static function empty(): array
    {
        return ['version' => '1.0', 'response' => new stdClass];
    }

    private static function plainText(string $text): array
    {
        return ['type' => 'PlainText', 'text' => self::fit($text)];
    }

    /** Caps speech at Alexa's limit, cutting after the last sentence that fits. */
    private static function fit(string $text): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');

        if ($text === '') {
            return self::SILENCE_FALLBACK;
        }

        if (mb_strlen($text) <= self::MAX_SPEECH_CHARACTERS) {
            return $text;
        }

        $window = mb_substr($text, 0, self::MAX_SPEECH_CHARACTERS);

        if (preg_match('/^.*[.!?](?=\s|$)/us', $window, $match)) {
            return rtrim($match[0]);
        }

        return $window;
    }
}
