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
}
