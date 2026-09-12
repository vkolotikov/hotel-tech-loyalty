<?php

namespace App\Voice;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * A voice write happens in two turns: propose, read back, confirm. The
 * proposal lives here rather than in gateway session state so the read-back
 * step holds whichever brain is driving the conversation, including a hosted
 * one that never touches our gateway.
 */
class NoteProposal
{
    public function issue(int $userId, string $subjectType, string $subjectId, string $body): string
    {
        $requestId = (string) Str::uuid();

        Cache::put($this->key($userId, $requestId), [
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'body' => $body,
        ], (int) config('voice.proposal_ttl_seconds', 120));

        return $requestId;
    }

    /** Returns the stored proposal once, then forgets it. */
    public function claim(int $userId, string $requestId): ?array
    {
        $key = $this->key($userId, $requestId);
        $proposal = Cache::get($key);

        if (! is_array($proposal)) {
            return null;
        }

        Cache::forget($key);

        return $proposal;
    }

    /** Keyed by user so one staff member can never claim another's proposal. */
    private function key(int $userId, string $requestId): string
    {
        return 'voice:note-proposal:'.$userId.':'.sha1($requestId);
    }
}
