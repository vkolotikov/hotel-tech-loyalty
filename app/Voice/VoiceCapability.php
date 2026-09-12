<?php

namespace App\Voice;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;

class VoiceCapability
{
    /** The MedTechAI industry id in Organization::INDUSTRIES. */
    private const MEDICAL = 'medical';

    public function assertEnabled(User $staff): void
    {
        if (! config('voice.enabled')) {
            throw new AuthorizationException('Voice access is not enabled on this deployment.');
        }

        $organizationId = (int) $staff->organization_id;
        if (! in_array($organizationId, $this->ids('voice.organization_ids'), true)) {
            throw new AuthorizationException('Voice access is not enabled for this organization.');
        }

        if ($this->isMedical($organizationId)
            && ! in_array($organizationId, $this->ids('voice.medical_organization_ids'), true)) {
            throw new AuthorizationException('Voice access requires a separate approval for this organization.');
        }
    }

    public function assertWritable(User $staff): void
    {
        $this->assertEnabled($staff);

        if ($this->isReadOnly($staff)) {
            throw new AuthorizationException('This organization can only read by voice. Add the note in the portal.');
        }
    }

    public function isReadOnly(User $staff): bool
    {
        return $this->isMedical((int) $staff->organization_id);
    }

    private function isMedical(int $organizationId): bool
    {
        $organization = Organization::find($organizationId);

        return $organization !== null && $organization->resolved_industry === self::MEDICAL;
    }

    /** Config may hold strings from the environment or integers from a test. */
    private function ids(string $key): array
    {
        return array_map('intval', (array) config($key, []));
    }
}
