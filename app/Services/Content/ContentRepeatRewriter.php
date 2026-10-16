<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;

/**
 * Rewords one copy of a repeated post (spec 2026-10-15 §8): the same meaning, language and length in fresh words.
 * Not final, so tests mock it.
 */
class ContentRepeatRewriter
{
    public function __construct(protected AiClient $ai)
    {
    }

    /** @return array{hook: ?string, main_copy: ?string} */
    public function rewrite(ContentPlannerPost $copy): array
    {
        $profile = ContentPlannerProfile::findOrFail($copy->planner_profile_id);
        $data = $this->ai->generateJson($profile, 'repeat_rewrite', $this->prompt($copy), 2000);

        return [
            'hook'      => isset($data['hook']) ? mb_substr(trim((string) $data['hook']), 0, 500) : $copy->hook,
            'main_copy' => isset($data['main_copy']) ? mb_substr(trim((string) $data['main_copy']), 0, 20000) : $copy->main_copy,
        ];
    }

    private function prompt(ContentPlannerPost $copy): string
    {
        return "Rewrite this {$copy->platform} post so it says the same thing in fresh words. Keep its language ({$copy->language}), "
            . "its length, every offer, price, date and link exactly, and the intent of its call to action.\n"
            . 'Hook: ' . ($copy->hook ?? '') . "\nText:\n" . ($copy->main_copy ?? '') . "\n"
            . 'Return ONLY JSON: {"hook": "...", "main_copy": "..."}';
    }
}
