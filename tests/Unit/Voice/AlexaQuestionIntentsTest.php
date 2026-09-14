<?php

namespace Tests\Unit\Voice;

use App\Voice\Alexa\AlexaQuestionIntents;
use PHPUnit\Framework\TestCase;

class AlexaQuestionIntentsTest extends TestCase
{
    public function test_the_opening_words_alexa_strips_are_put_back(): void
    {
        // Alexa only sends the words after a carrier phrase, so without this the
        // model heard "leads came in today" and had to guess the question.
        $this->assertSame('how many leads came in today', AlexaQuestionIntents::questionFrom('HowManyIntent', 'leads came in today'));
        $this->assertSame('who is booked next', AlexaQuestionIntents::questionFrom('WhoIsIntent', 'booked next'));
        $this->assertSame('find Morgan Lee', AlexaQuestionIntents::questionFrom('FindIntent', 'Morgan Lee'));
        $this->assertSame('leads today', AlexaQuestionIntents::questionFrom('AskIntent', ' leads today '));
    }

    public function test_overlapping_openings_rebuild_the_same_question(): void
    {
        // Alexa may route "what is booked next" to either intent.
        $this->assertSame(AlexaQuestionIntents::questionFrom('WhatIntent', 'is booked next'),
            AlexaQuestionIntents::questionFrom('WhatIsIntent', 'booked next'));
    }

    public function test_non_question_intents_and_empty_slots_give_no_question(): void
    {
        $this->assertNull(AlexaQuestionIntents::questionFrom('PairIntent', '123456'));
        $this->assertNull(AlexaQuestionIntents::questionFrom('AMAZON.HelpIntent', null));
        $this->assertNull(AlexaQuestionIntents::questionFrom('HowManyIntent', '   '));
        $this->assertTrue(AlexaQuestionIntents::isQuestionIntent('WhatIsIntent'));
        $this->assertFalse(AlexaQuestionIntents::isQuestionIntent('AMAZON.StopIntent'));
    }

    public function test_yes_and_no_are_passed_on_as_replies(): void
    {
        // The model may be waiting for one, such as whether to save a note it read back.
        $this->assertSame('yes', AlexaQuestionIntents::questionFrom('AMAZON.YesIntent', null));
        $this->assertSame('no', AlexaQuestionIntents::questionFrom('AMAZON.NoIntent', null));
        $this->assertFalse(AlexaQuestionIntents::isQuestionIntent('AMAZON.YesIntent'));
    }

    public function test_every_question_intent_captures_free_speech_after_a_carrier_phrase(): void
    {
        $intents = AlexaQuestionIntents::interactionModel()['interactionModel']['languageModel']['intents'];
        $questions = array_values(array_filter($intents, fn (array $intent) => AlexaQuestionIntents::isQuestionIntent($intent['name'])));

        $this->assertGreaterThanOrEqual(15, count($questions));
        foreach ($questions as $intent) {
            $this->assertSame([['name' => 'query', 'type' => 'AMAZON.SearchQuery']], $intent['slots'], $intent['name']);
            foreach ($intent['samples'] as $sample) {
                $this->assertStringContainsString('{query}', $sample);
                $this->assertNotSame('', trim(str_replace('{query}', '', $sample)), "{$intent['name']} needs a carrier phrase");
                $this->assertSame(mb_strtolower($sample), $sample, 'Sample utterances are lower case.');
            }
        }
    }

    public function test_no_sample_is_shared_between_intents(): void
    {
        $samples = [];
        foreach (AlexaQuestionIntents::interactionModel()['interactionModel']['languageModel']['intents'] as $intent) {
            array_push($samples, ...$intent['samples']);
        }

        // Identical samples in two intents fail Amazon's model build.
        $this->assertSame(count($samples), count(array_unique($samples)));
    }

    public function test_the_model_keeps_pairing_and_the_required_built_ins_under_the_hexa_name(): void
    {
        $language = AlexaQuestionIntents::interactionModel()['interactionModel']['languageModel'];

        $this->assertSame('hexa', $language['invocationName']);
        $names = array_column($language['intents'], 'name');
        foreach (['PairIntent', 'AMAZON.YesIntent', 'AMAZON.NoIntent', 'AMAZON.HelpIntent', 'AMAZON.StopIntent',
            'AMAZON.CancelIntent', 'AMAZON.NavigateHomeIntent', 'AMAZON.FallbackIntent'] as $required) {
            $this->assertContains($required, $names);
        }
    }
}
