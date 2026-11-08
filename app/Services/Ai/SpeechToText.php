<?php

namespace App\Services\Ai;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * A staff member's recording as text (moved out of ChatInboxController::transcribe on 2026-11-09, unchanged, so the
 * inbox's dictation and HexaTech Time Planner's voice input share one rule): OpenAI's `gpt-4o-transcribe`, then
 * `whisper-1` if that is refused; the language from the request (`lv-LV` → `lv`, `auto` = let the model tell).
 *
 * Answers ['text' => …, 'language' => …], or null with the reason in $failure: `unavailable` (no OpenAI key) or
 * `failed` (the provider refused or could not be reached; its words go to the log only).
 */
final class SpeechToText
{
    public const RULES = 'required|file|max:25600|mimes:webm,ogg,oga,mp3,mp4,m4a,wav,mpga,flac';

    public static function configured(): bool
    {
        return (bool) config('openai.api_key');
    }

    /** @return array{text: string, language: mixed}|null */
    public function transcribe(UploadedFile $file, ?string $language, ?string &$failure = null): ?array
    {
        // config/openai.php reads OPENAI_API_KEY; env() itself is empty once the config is cached.
        $apiKey = config('openai.api_key');
        if (!$apiKey) {
            $failure = 'unavailable';

            return null;
        }

        $code = null;
        if ($language) {
            $language = strtolower(trim($language));
            if ($language !== 'auto' && $language !== '') {
                $code = substr(explode('-', $language)[0], 0, 2);
            }
        }

        $payload = ['model' => 'gpt-4o-transcribe', 'response_format' => 'json'];
        if ($code) {
            $payload['language'] = $code;
        }

        try {
            $response = Http::withToken($apiKey)
                ->timeout(45)
                ->attach('file', file_get_contents($file->getRealPath()), $file->getClientOriginalName() ?: 'audio.webm')
                ->post('https://api.openai.com/v1/audio/transcriptions', $payload);

            if (!$response->successful()) {
                $payload['model'] = 'whisper-1';
                $response = Http::withToken($apiKey)
                    ->timeout(45)
                    ->attach('file', file_get_contents($file->getRealPath()), $file->getClientOriginalName() ?: 'audio.webm')
                    ->post('https://api.openai.com/v1/audio/transcriptions', $payload);
            }

            if (!$response->successful()) {
                Log::warning('Admin transcribe failed', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                $failure = 'failed';

                return null;
            }

            return [
                'text'     => trim((string) $response->json('text', '')),
                'language' => $response->json('language'),
            ];
        } catch (\Throwable $e) {
            Log::error('Admin transcribe crashed: ' . $e->getMessage());
            $failure = 'crashed';

            return null;
        }
    }
}
