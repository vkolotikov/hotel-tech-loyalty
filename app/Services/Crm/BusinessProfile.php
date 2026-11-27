<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Jobs\DiscoverGuestBusiness;
use App\Models\Guest;
use App\Models\GuestBusinessProfile;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class BusinessProfile
{
    public const MODEL = LeadAssistantWriter::EMAIL_MODEL;

    public const GROUPS = [
        'identity' => ['company_name' => 'short', 'website_url' => 'url', 'industry' => 'short', 'brand_summary' => 'text'],
        'positioning' => ['mission' => 'text', 'brand_values' => 'list', 'usp' => 'text', 'differentiators' => 'text'],
        'offer' => ['products' => 'list', 'services' => 'list', 'target_audience' => 'list', 'markets' => 'list'],
        'planning' => ['service_opportunities' => 'list', 'proposal_questions' => 'list'],
    ];

    private const MAX_AGE_MINUTES = 12;

    public static function definitions(): array
    {
        return array_merge(...array_values(self::GROUPS));
    }

    public static function publicDefinitions(): array
    {
        return array_diff_key(self::definitions(), self::GROUPS['planning']);
    }

    public static function validationRules(): array
    {
        $definitions = self::definitions();
        $rules = ['fields' => 'required|array:'.implode(',', array_keys($definitions))];
        foreach ($definitions as $key => $type) {
            $limit = self::limit($type);
            $rules["fields.$key"] = match ($type) {
                'url' => ['nullable', 'string', "max:$limit", 'url:http,https', function ($attribute, $value, $fail) {
                    if (! self::publicUrl($value)) {
                        $fail('Enter a public website URL.');
                    }
                }],
                'list' => ['nullable', 'array', 'list', 'max:12'],
                default => "nullable|string|max:$limit",
            };
            if ($type === 'list') {
                $rules["fields.$key.*"] = 'required|string|max:200';
            }
        }

        return $rules;
    }

    public static function clean(string $type, mixed $value): string|array|null
    {
        if ($type === 'list') {
            return is_array($value) ? array_slice(array_values(array_unique(array_filter(array_map(
                fn ($item) => is_string($item) ? trim(mb_substr($item, 0, 200)) : '',
                $value,
            )))), 0, 12) : [];
        }
        if (! is_string($value)) {
            return null;
        }

        return $type === 'url' ? self::publicUrl($value) : (trim(mb_substr($value, 0, self::limit($type))) ?: null);
    }

    public static function sourcedDiscovery(?GuestBusinessProfile $profile, array $reviewed): array
    {
        $run = $profile?->discovery;
        if (($run['status'] ?? null) !== 'ready') {
            return [];
        }
        $findings = [];
        foreach (array_diff_key(self::publicDefinitions(), $reviewed) as $key => $type) {
            $value = self::clean($type, $run['fields'][$key] ?? null);
            $urls = array_filter(array_map(self::publicUrl(...), array_column($run['sources'][$key] ?? [], 'url')));
            if ($value && $urls) {
                $findings[$key] = ['value' => $value, 'sources' => array_slice($urls, 0, 3)];
            }
        }

        return $findings;
    }

    public static function publicUrl(mixed $value): ?string
    {
        if (! is_string($value) || strlen($value) > 2048 || preg_match('/[\\\\\x00-\x20\x7f]/', $value) || ! filter_var($value, FILTER_VALIDATE_URL)) {
            return null;
        }
        $url = parse_url($value);
        $host = rtrim(strtolower($url['host'] ?? ''), '.');

        return in_array(strtolower($url['scheme'] ?? ''), ['http', 'https'], true) && str_contains($host, '.')
            && ! isset($url['user']) && ! isset($url['pass']) && ! filter_var($host, FILTER_VALIDATE_IP)
            && ! preg_match('/\.(localhost|local|internal|lan)$/D', $host) ? $value : null;
    }

    public function data(Guest $guest, ?string $company = null): array
    {
        $profile = GuestBusinessProfile::find($guest->id);
        $discovery = $profile?->discovery;
        if ($this->expired($discovery)) {
            $discovery = ['status' => 'failed', 'error' => 'discovery_timed_out'];
        }

        return [
            'groups' => self::GROUPS,
            'fields' => (object) ($profile->fields ?? []),
            'suggested_company' => $company ?: $guest->company,
            'sources' => (object) ($profile->sources ?? []),
            'revision' => $profile->revision ?? 0,
            'updated_at' => $profile?->updated_at?->toISOString(),
            'discovery' => $discovery ? array_diff_key($discovery, array_flip(['identity', 'requested_by'])) : null,
        ];
    }

    /** Called by GuestMergeService inside its transaction. Reviewed values follow the kept contact. */
    public function merge(Guest $winner, Guest $loser): void
    {
        if (! Schema::hasTable('guest_business_profiles')) {
            return;
        }
        $profiles = GuestBusinessProfile::query()->whereKey([$winner->id, $loser->id])->orderBy('guest_id')->lockForUpdate()->get()->keyBy('guest_id');
        $incoming = $profiles->get($loser->id);
        if (! $incoming?->fields) {
            return;
        }
        $kept = $profiles->get($winner->id) ?? $this->lock($winner);
        $current = $kept->fields ?? [];
        $added = array_diff_key($incoming->fields, $current);
        $kept->update([
            'fields' => $current + $added,
            'sources' => ($kept->sources ?? []) + array_intersect_key($incoming->sources ?? [], $added),
            'revision' => $kept->revision + 1,
        ]);
    }

    public function save(Guest $guest, array $input): void
    {
        DB::transaction(function () use ($guest, $input) {
            $profile = $this->lock($guest);
            if ($profile->revision !== $input['revision']) {
                throw new AiHelperRefused('profile_changed', 'This business profile has changed. Reload it before saving.', 409);
            }

            $run = $profile->discovery;
            $useDraft = isset($input['discovery_id']) && ($run['status'] ?? null) === 'ready' && $input['discovery_id'] === ($run['id'] ?? null);
            $fields = $profile->fields ?? [];
            $sources = $profile->sources ?? [];
            foreach ($input['fields'] as $key => $value) {
                $clean = self::clean(self::definitions()[$key], $value);
                if ($useDraft && $clean && $clean === ($run['fields'][$key] ?? null)) {
                    $sources[$key] = $run['sources'][$key];
                } elseif ($clean !== ($fields[$key] ?? null)) {
                    unset($sources[$key]);
                }
                $fields[$key] = $clean;
            }
            $profile->update(['fields' => array_filter($fields), 'sources' => $sources, 'revision' => $profile->revision + 1]);
        });
    }

    public function start(Guest $guest, array $identity, int $userId): void
    {
        self::checkAvailability((int) $guest->organization_id);
        DB::transaction(function () use ($guest, $identity, $userId) {
            $profile = $this->lock($guest);
            if ($this->active($profile->discovery) && ! $this->expired($profile->discovery)) {
                return;
            }
            $runId = (string) Str::uuid();
            $profile->update(['discovery' => [
                'id' => $runId,
                'status' => 'queued',
                'started_at' => now()->toISOString(),
                'identity' => $identity,
                'requested_by' => $userId,
            ]]);
            DiscoverGuestBusiness::dispatch((int) $guest->id, (int) $guest->organization_id, $runId)->afterCommit();
        });
    }

    public function claim(int $guestId, string $runId): ?array
    {
        return DB::transaction(function () use ($guestId, $runId) {
            $profile = GuestBusinessProfile::query()->lockForUpdate()->find($guestId);
            $run = $profile?->discovery;
            if (($run['id'] ?? null) !== $runId || $run['status'] !== 'queued' || $this->expired($run)) {
                return null;
            }
            $profile->update(['discovery' => [...$run, 'status' => 'running']]);

            return $run;
        });
    }

    public function complete(int $guestId, string $runId, array $result): void
    {
        DB::transaction(function () use ($guestId, $runId, $result) {
            $profile = GuestBusinessProfile::query()->lockForUpdate()->find($guestId);
            $run = $profile?->discovery;
            if (($run['id'] ?? null) === $runId && $this->active($run)) {
                $profile->update(['discovery' => ['id' => $runId, ...$result, 'finished_at' => now()->toISOString()]]);
            }
        });
    }

    public static function checkAvailability(int $orgId): void
    {
        $org = Organization::findOrFail($orgId);
        AiHelperRefused::unlessAllowanceLeft($org);
        if (! config('openai.api_key')) {
            throw new AiHelperRefused('discovery_unavailable', 'AI Discovery is unavailable for this workspace.', 503);
        }
    }

    private static function limit(string $type): int
    {
        return match ($type) {
            'short' => 200,
            'url' => 2048,
            default => 2000,
        };
    }

    private function lock(Guest $guest): GuestBusinessProfile
    {
        GuestBusinessProfile::query()->firstOrCreate(['guest_id' => $guest->id]);

        return GuestBusinessProfile::query()->lockForUpdate()->findOrFail($guest->id);
    }

    private function active(?array $run): bool
    {
        return in_array($run['status'] ?? null, ['queued', 'running'], true);
    }

    private function expired(?array $run): bool
    {
        return $this->active($run) && now()->subMinutes(self::MAX_AGE_MINUTES)->isAfter($run['started_at']);
    }
}
