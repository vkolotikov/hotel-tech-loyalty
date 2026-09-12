<?php

namespace App\Mcp\Support;

use App\Models\User;
use App\Voice\SpeakableRenderer;
use App\Voice\VoiceCapability;

abstract class VoiceTool extends HexaTechTool
{
    /** Write tools set this so the capability gate demands a writable organization. */
    protected bool $requiresWrite = false;

    /**
     * HexaTechTool::handle() is final, so the voice gate hangs off execute().
     * authorize() is idempotent and already succeeded inside handle().
     */
    final protected function execute(array $data, CustomerBookingAccess $access): array
    {
        $staff = $access->authorize();
        $capability = app(VoiceCapability::class);

        $this->requiresWrite
            ? $capability->assertWritable($staff)
            : $capability->assertEnabled($staff);

        return $this->speak($data, $access, $staff);
    }

    abstract protected function speak(array $data, CustomerBookingAccess $access, User $staff): array;

    protected function renderer(User $staff): SpeakableRenderer
    {
        return new SpeakableRenderer((string) ($staff->language ?: 'en'));
    }

    /**
     * listBookings() returns a page, never a total. Report what was actually
     * counted and whether more exist, so a page is never spoken as a total.
     *
     * @return array{count:int, at_least:bool}
     */
    protected function countBookings(array $result): array
    {
        return [
            'count' => count($result['bookings']),
            'at_least' => ($result['next_page'] ?? null) !== null || ($result['results_truncated'] ?? false),
        ];
    }

    /** "at least fifty appointments" when the page was full, else "one appointment". */
    protected function spokenBookingCount(array $counted, SpeakableRenderer $renderer,
        string $singular, string $plural): string
    {
        $phrase = $renderer->countPhrase($counted['count'], $singular, $plural);

        return $counted['at_least'] ? 'at least '.$phrase : $phrase;
    }
}
