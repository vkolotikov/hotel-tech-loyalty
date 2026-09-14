<?php

namespace App\Console\Commands;

use App\Voice\Alexa\AlexaQuestionIntents;
use Illuminate\Console\Command;

class VoiceAlexaModel extends Command
{
    private const PATH = 'docs/alexa/interaction-model.json';

    protected $signature = 'voice:alexa-model {--check : Fail instead of writing when the committed file is out of date}';

    protected $description = 'Write the Alexa skill interaction model generated from AlexaQuestionIntents';

    public function handle(): int
    {
        $path = base_path(self::PATH);

        if ($this->option('check')) {
            // Compared as data, so a checkout with CRLF line endings still passes.
            $committed = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
            if ($committed !== AlexaQuestionIntents::interactionModel()) {
                $this->error(self::PATH.' is out of date. Run: php artisan voice:alexa-model');

                return self::FAILURE;
            }

            $this->line(self::PATH.' is up to date.');

            return self::SUCCESS;
        }

        file_put_contents($path, AlexaQuestionIntents::json());
        $this->line('Wrote '.self::PATH.'. Upload it to every skill locale, then build the model.');

        return self::SUCCESS;
    }
}
