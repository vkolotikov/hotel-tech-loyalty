<?php

namespace App\Voice\Alexa;

/**
 * The skill's interaction model, and the way back from an Alexa intent to the
 * words that were said.
 *
 * Free speech needs AMAZON.SearchQuery, which only matches after a carrier
 * phrase and then strips that phrase from the slot: "how many leads came in
 * today" arrives as "leads came in today". So every opening is its own intent,
 * and its words are put back before the question reaches the model. All the
 * carriers of one intent mean its prefix, which keeps the rebuilt question the
 * same whichever of two overlapping intents Alexa picks: "what is booked next"
 * is "what" + "is booked next" or "what is" + "booked next".
 *
 * docs/alexa/interaction-model.json is generated from this class with
 * `php artisan voice:alexa-model`, and a test fails while the two differ.
 */
final class AlexaQuestionIntents
{
    public const INVOCATION_NAME = 'hexa';

    /** Intent => [words put back in front of the slot, carrier phrases]. */
    private const QUESTIONS = [
        'HowManyIntent' => ['how many', ['how many']],
        'HowMuchIntent' => ['how much', ['how much']],
        'HowIsIntent' => ['how is', ['how is', "how's"]],
        'HowAreIntent' => ['how are', ['how are']],
        'HowIntent' => ['how', ['how']],
        'WhatIsIntent' => ['what is', ['what is', "what's"]],
        'WhatAreIntent' => ['what are', ['what are']],
        'WhatIntent' => ['what', ['what']],
        'WhoIsIntent' => ['who is', ['who is', "who's"]],
        'WhoIntent' => ['who', ['who']],
        'WhenIsIntent' => ['when is', ['when is', "when's"]],
        'WhenIntent' => ['when', ['when']],
        'WhereIsIntent' => ['where is', ['where is', "where's"]],
        'WhereIntent' => ['where', ['where']],
        'WhichIntent' => ['which', ['which']],
        'IsThereIntent' => ['is there', ['is there']],
        'AreThereIntent' => ['are there', ['are there']],
        'IsIntent' => ['is', ['is']],
        'AreIntent' => ['are', ['are']],
        'DoWeHaveIntent' => ['do we have', ['do we have', 'have we got']],
        'DoIHaveIntent' => ['do I have', ['do i have', 'have i got']],
        'DoIntent' => ['do', ['do']],
        'DoesIntent' => ['does', ['does']],
        'DidIntent' => ['did', ['did']],
        'AnyIntent' => ['any', ['any']],
        // Follow-ups such as "and yesterday?"
        'AndIntent' => ['and', ['and']],
        'FindIntent' => ['find', ['find', 'look up', 'search for']],
        'ShowMeIntent' => ['show me', ['show me', 'give me', 'get me', 'read me']],
        'ListIntent' => ['list', ['list']],
        'TellMeIntent' => ['tell me', ['tell me']],
        'CheckIntent' => ['check', ['check']],
        'AddIntent' => ['add', ['add']],
        'NoteIntent' => ['note', ['note', 'make a note', 'take a note']],
        'CanYouIntent' => ['can you', ['can you', 'could you']],
        'PleaseIntent' => ['please', ['please']],
        'IWantIntent' => ['I want', ['i want', "i'd like", 'i would like', 'i need']],
        // The original catch-all, kept so a request routed by the previous
        // model still answers while a new one is building.
        'AskIntent' => ['', ['ask', 'my question is']],
    ];

    /**
     * A yes or no answers whatever the model last asked, such as whether to
     * save a note it read back, so it goes to the model like a question.
     */
    private const REPLIES = ['AMAZON.YesIntent' => 'yes', 'AMAZON.NoIntent' => 'no'];

    private const PAIR_SAMPLES = ['link code {code}', 'link with code {code}', 'pair code {code}',
        'pair with code {code}', 'my code is {code}', 'the code is {code}'];

    private const BUILT_INS = ['AMAZON.YesIntent', 'AMAZON.NoIntent', 'AMAZON.HelpIntent', 'AMAZON.StopIntent',
        'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent', 'AMAZON.FallbackIntent'];

    /**
     * What was said, rebuilt from the intent and its query slot. Null when the
     * intent is neither a question nor a reply, or when Alexa matched an
     * opening but heard nothing after it.
     */
    public static function questionFrom(string $intent, ?string $query): ?string
    {
        if (isset(self::REPLIES[$intent])) {
            return self::REPLIES[$intent];
        }

        $query = trim((string) $query);
        if (! self::isQuestionIntent($intent) || $query === '') {
            return null;
        }

        return ltrim(self::QUESTIONS[$intent][0].' '.$query);
    }

    /** Whether the intent carries free speech in its query slot. */
    public static function isQuestionIntent(string $intent): bool
    {
        return isset(self::QUESTIONS[$intent]);
    }

    public static function interactionModel(): array
    {
        $intents = [];
        foreach (self::QUESTIONS as $name => [, $carriers]) {
            $intents[] = ['name' => $name,
                'slots' => [['name' => 'query', 'type' => 'AMAZON.SearchQuery']],
                'samples' => array_map(fn (string $carrier) => $carrier.' {query}', $carriers)];
        }

        // Named for four digits, but it captures the six-digit pairing codes,
        // leading zeros included, on a live Echo.
        $intents[] = ['name' => 'PairIntent',
            'slots' => [['name' => 'code', 'type' => 'AMAZON.FOUR_DIGIT_NUMBER']],
            'samples' => self::PAIR_SAMPLES];

        foreach (self::BUILT_INS as $name) {
            $intents[] = ['name' => $name, 'samples' => []];
        }

        return ['interactionModel' => ['languageModel' => [
            'invocationName' => self::INVOCATION_NAME,
            'intents' => $intents,
            'types' => [],
        ]]];
    }

    /** The model as Amazon's JSON editor and the Skill Management API take it. */
    public static function json(): string
    {
        return json_encode(self::interactionModel(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n";
    }
}
