<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Models\Brand;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ContentPlannerProfile;
use App\Models\CrmSalesProfileCapture;
use App\Models\Organization;
use App\Scopes\BrandScope;
use Illuminate\Support\Facades\DB;

final class SalesProfile
{
    public const PUBLIC_FIELDS = ['name', 'website', 'overview', 'offerings', 'usp', 'values', 'markets', 'proof', 'terms', 'next_step'];

    public const GROUPS = [
        'business' => ['name', 'website', 'overview', 'usp', 'values', 'audiences', 'markets'],
        'selling' => ['offerings', 'positioning', 'proof', 'terms', 'voice', 'guidelines', 'next_step', 'goal', 'email_instructions'],
    ];

    public const STEPS = [
        'company' => ['name', 'website', 'overview', 'values'],
        'market' => ['usp', 'audiences', 'markets', 'positioning'],
        'services' => ['offerings', 'proof', 'terms', 'voice', 'guidelines', 'next_step', 'goal', 'email_instructions'],
    ];

    public static function keys(): array
    {
        return array_merge(...array_values(self::STEPS));
    }

    public static function clean(string $key, mixed $value): string
    {
        if (! is_string($value)) {
            return '';
        }
        $value = trim(str_replace("\0", '', $value));

        return $key === 'website' ? (BusinessProfile::publicUrl($value) ?? '') : mb_substr($value, 0, $key === 'goal' ? 1000 : 3000);
    }

    public static function rules(): array
    {
        $keys = self::keys();
        $rules = [
            'fields' => 'present|array:'.implode(',', $keys), 'revision' => 'required|integer|min:0',
            'profile_brand' => 'required|integer|min:1', 'capture_id' => 'nullable|uuid',
            'shared_fields' => 'sometimes|array|list', 'shared_fields.*' => 'distinct|in:'.implode(',', self::PUBLIC_FIELDS),
            'expected_goal' => 'nullable|string|max:1000',
        ];
        foreach ($keys as $key) {
            $rules["fields.$key"] = $key === 'website' ? 'nullable|string|max:2000|url:http,https' : 'nullable|string|max:3000';
        }

        $rules['fields.goal'] = 'nullable|string|max:1000';

        return $rules;
    }

    public function data(Organization $org, Brand $brand, ?ChatbotBehaviorConfig $behavior = null): array
    {
        abort_unless((int) $brand->organization_id === (int) $org->id, 404);
        $manual = $brand->crm_sales_profile ?? [];
        $inherited = $this->content($org, $brand);
        $saved = $manual['fields'] ?? [];
        $behavior ??= ChatbotBehaviorConfig::getForOrg((int) $org->id, (int) $brand->id);
        if (filled($behavior->goal)) {
            $saved['goal'] = (string) $behavior->goal;
        }
        $sources = $manual['sources'] ?? [];
        if (($manual['goal_hash'] ?? null) !== hash('sha256', (string) $behavior->goal)) {
            unset($sources['goal']);
        }
        $defaults = $this->brandDefaults($brand);
        $fields = $saved + $inherited + $defaults;

        return [
            'brand' => ['id' => (int) $brand->id, 'name' => $brand->name],
            'groups' => self::GROUPS,
            'steps' => self::STEPS,
            'fields' => (object) $fields,
            'manual' => (object) $saved,
            'shareable' => self::PUBLIC_FIELDS,
            'shared_fields' => $manual['shared_fields'] ?? [],
            'inherited' => (object) $inherited,
            'defaults' => (object) $defaults,
            'sources' => (object) $sources,
            'revision' => $manual['revision'] ?? 0,
        ];
    }

    public function save(Brand $brand, array $input): Brand
    {
        return DB::transaction(function () use ($brand, $input): Brand {
            $brand = Brand::query()->lockForUpdate()->findOrFail($brand->id);
            $profile = $brand->crm_sales_profile ?? [];
            $revision = $profile['revision'] ?? 0;
            if ((int) $input['profile_brand'] !== (int) $brand->id || (int) $input['revision'] !== $revision) {
                throw new AiHelperRefused('sales_profile_changed', 'The business profile changed. Reload it before saving.', 409);
            }
            $fields = $profile['fields'] ?? [];
            $sources = $profile['sources'] ?? [];
            $goalHash = $profile['goal_hash'] ?? null;
            $suggestions = [];
            if (isset($input['capture_id'])) {
                $capture = CrmSalesProfileCapture::query()->whereKey($brand->id)->where('run_id', $input['capture_id'])
                    ->where('status', 'ready')->value('outcome');
                $suggestions = $capture['fields'] ?? [];
            }
            foreach ($input['fields'] as $key => $value) {
                $value = trim((string) $value);
                if ($value === ($suggestions[$key]['value'] ?? null)) {
                    $sources[$key] = $suggestions[$key]['sources'];
                } elseif ($value !== ($fields[$key] ?? '')) {
                    unset($sources[$key]);
                }
                $fields[$key] = $value;
            }
            if (array_key_exists('goal', $input['fields'])) {
                $behavior = ChatbotBehaviorConfig::withoutGlobalScopes()->where('organization_id', $brand->organization_id)
                    ->where('brand_id', $brand->id)->lockForUpdate()->first();
                $previous = (string) ($behavior->goal ?? '');
                if (array_key_exists('expected_goal', $input) && $previous !== (string) $input['expected_goal']) {
                    throw new AiHelperRefused('sales_profile_changed', 'The shared goal changed. Reload it before saving.', 409);
                }
                if ($previous !== $fields['goal']) {
                    $behavior ??= ChatbotBehaviorConfig::getForOrg((int) $brand->organization_id, (int) $brand->id);
                    $behavior->forceFill(['goal' => $fields['goal'] ?: null])->save();
                }
                $goalHash = isset($sources['goal']) ? hash('sha256', $fields['goal']) : null;
                unset($fields['goal']);
            }
            $brand->forceFill(['crm_sales_profile' => [
                'shared_fields' => $input['shared_fields'] ?? $profile['shared_fields'] ?? [],
                'revision' => $revision + 1,
                'fields' => array_filter($fields, fn ($value) => $value !== ''),
                'sources' => $sources,
                'goal_hash' => $goalHash,
            ]])->save();

            return $brand;
        });
    }

    /** Only fields the manager marked for customers may enter a visitor's conversation. */
    public function publicFacts(Brand $brand): array
    {
        $profile = $brand->crm_sales_profile ?? [];
        $keys = array_intersect(self::PUBLIC_FIELDS, $profile['shared_fields'] ?? []);
        if (! $keys) {
            return [];
        }
        $fields = $profile['fields'] ?? [];
        if (array_diff($keys, array_keys($fields))) {
            $fields += $this->content(Organization::findOrFail($brand->organization_id), $brand);
        }
        $fields += $this->brandDefaults($brand);

        return array_intersect_key($fields, array_flip($keys));
    }

    private function content(Organization $org, Brand $brand): array
    {
        if (! $org->holdsModule('content') || ! $org->workspaceEnabled('content')) {
            return [];
        }
        $profile = ContentPlannerProfile::withoutGlobalScope(BrandScope::class)->where('organization_id', $org->id)
            ->where('brand_id', $brand->id)->latest('id')->first();
        if (! $profile) {
            return [];
        }
        $audiences = $profile->audiences()->withoutGlobalScope(BrandScope::class)->where('brand_id', $brand->id)
            ->where('is_ai_assumed', false)->active()->oldest('id')->limit(8)->get();
        $voice = $profile->brandVoices()->withoutGlobalScope(BrandScope::class)->where('brand_id', $brand->id)
            ->active()->latest('id')->first();
        $snippets = $profile->snippets()->withoutGlobalScope(BrandScope::class)->where('brand_id', $brand->id)
            ->where('kind', 'text')->orderBy('sort_order')->orderBy('id')->limit(6)->get();
        $positioning = [$profile->brand_promise, $profile->differentiators, ...array_values($profile->positioning ?? [])];
        $guidelines = [...array_values($profile->content_rules ?? []), ...($voice->claims_to_avoid ?? [])];

        return array_filter([
            'name' => $this->text($profile->name),
            'website' => BusinessProfile::publicUrl(data_get($profile->important_links, 'website')) ?? '',
            'overview' => $this->lines([$profile->brand_summary, $profile->mission, $profile->knowledge_summary_short]),
            'usp' => $this->text($profile->usp),
            'values' => $this->lines($profile->brand_values ?? []),
            'audiences' => $this->lines($audiences->map(fn ($row) => implode(' — ', array_filter([$row->name, $row->description, $row->job_role])))->all()),
            'markets' => $this->lines($audiences->pluck('country')->filter()->unique()->all()),
            'offerings' => $this->lines($snippets->map(fn ($row) => $row->name.': '.$row->body)->all()),
            'positioning' => $this->lines($positioning),
            'proof' => $this->lines($profile->proof_points ?? []),
            'voice' => $this->lines([$voice->tone ?? $profile->default_tone, $voice?->formality_level, $voice?->style]),
            'guidelines' => $this->lines($guidelines),
            'next_step' => $this->text($profile->main_cta),
        ], fn ($value) => $value !== '');
    }

    private function brandDefaults(Brand $brand): array
    {
        $domain = trim((string) $brand->domain);

        return array_filter([
            'name' => $brand->name,
            'overview' => $this->text($brand->getAttribute('description')),
            'website' => BusinessProfile::publicUrl(str_contains($domain, '://') ? $domain : 'https://'.$domain),
        ], fn ($value) => filled($value));
    }

    private function lines(array $values): string
    {
        return $this->text(implode("\n", array_filter($values, 'is_string')));
    }

    private function text(mixed $value): string
    {
        return is_string($value) ? mb_substr(trim($value), 0, 3000) : '';
    }
}
