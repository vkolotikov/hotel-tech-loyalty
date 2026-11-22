<?php

namespace App\Services\Crm;

use App\Exceptions\AiHelperRefused;
use App\Models\Brand;
use App\Models\ContentPlannerProfile;
use App\Models\CrmSalesProfileCapture;
use App\Models\Organization;
use App\Scopes\BrandScope;
use Illuminate\Support\Facades\DB;

final class SalesProfile
{
    public const GROUPS = [
        'business' => ['name', 'website', 'overview', 'usp', 'values', 'audiences', 'markets'],
        'selling' => ['offerings', 'positioning', 'proof', 'terms', 'voice', 'guidelines', 'next_step'],
    ];

    public const STEPS = [
        'company' => ['name', 'website', 'overview', 'values'],
        'market' => ['usp', 'audiences', 'markets', 'positioning'],
        'services' => ['offerings', 'proof', 'terms', 'voice', 'guidelines', 'next_step'],
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

        return $key === 'website' ? (BusinessProfile::publicUrl($value) ?? '') : mb_substr($value, 0, 3000);
    }

    public static function rules(): array
    {
        $keys = self::keys();
        $rules = [
            'fields' => 'required|array:'.implode(',', $keys), 'revision' => 'required|integer|min:0',
            'profile_brand' => 'required|integer|min:1', 'capture_id' => 'nullable|uuid',
        ];
        foreach ($keys as $key) {
            $rules["fields.$key"] = $key === 'website' ? 'nullable|string|max:2000|url:http,https' : 'nullable|string|max:3000';
        }

        return $rules;
    }

    public function data(Organization $org, Brand $brand): array
    {
        abort_unless((int) $brand->organization_id === (int) $org->id, 404);
        $manual = $brand->crm_sales_profile ?? [];
        $inherited = $this->content($org, $brand);
        $fields = ($manual['fields'] ?? []) + $inherited + ['name' => $brand->name];

        return [
            'brand' => ['id' => (int) $brand->id, 'name' => $brand->name],
            'groups' => self::GROUPS,
            'steps' => self::STEPS,
            'fields' => (object) $fields,
            'manual' => (object) ($manual['fields'] ?? []),
            'inherited' => (object) $inherited,
            'sources' => (object) ($manual['sources'] ?? []),
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
            $brand->forceFill(['crm_sales_profile' => [
                'revision' => $revision + 1,
                'fields' => array_filter($fields, fn ($value) => $value !== ''),
                'sources' => $sources,
            ]])->save();

            return $brand;
        });
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
        $guidelines = [...array_values($profile->content_rules ?? []), ...($voice?->claims_to_avoid ?? [])];

        return array_filter([
            'name' => $this->text($profile->name),
            'website' => $this->website($profile, $brand),
            'overview' => $this->lines([$profile->brand_summary, $profile->mission, $profile->knowledge_summary_short]),
            'usp' => $this->text($profile->usp),
            'values' => $this->lines($profile->brand_values ?? []),
            'audiences' => $this->lines($audiences->map(fn ($row) => implode(' — ', array_filter([$row->name, $row->description, $row->job_role])))->all()),
            'markets' => $this->lines($audiences->pluck('country')->filter()->unique()->all()),
            'offerings' => $this->lines($snippets->map(fn ($row) => $row->name.': '.$row->body)->all()),
            'positioning' => $this->lines($positioning),
            'proof' => $this->lines($profile->proof_points ?? []),
            'voice' => $this->lines([$voice?->tone ?? $profile->default_tone, $voice?->formality_level, $voice?->style]),
            'guidelines' => $this->lines($guidelines),
            'next_step' => $this->text($profile->main_cta),
        ], fn ($value) => $value !== '');
    }

    private function website(ContentPlannerProfile $profile, Brand $brand): string
    {
        $domain = trim((string) $brand->domain);
        $url = data_get($profile->important_links, 'website');

        return BusinessProfile::publicUrl($url)
            ?? BusinessProfile::publicUrl(str_contains($domain, '://') ? $domain : 'https://'.$domain)
            ?? '';
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
