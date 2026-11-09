<?php

namespace App\Services\Media;

use App\Models;
use Illuminate\Support\Facades\{DB, Schema, Storage};

/** Reviewed active media fields only. Never scans credentials, audit records or sent-message bodies. */
class References
{
    private const FIELDS = [
        Models\Organization::class => ['logo_url'], Models\Brand::class => ['logo_url'],
        Models\User::class => ['avatar_url', 'chat_avatar_url'], Models\Property::class => ['image_url'],
        Models\SpecialOffer::class => ['image_url'], Models\Reward::class => ['image_url'],
        Models\BookingRoom::class => ['image', 'gallery'], Models\BookingExtra::class => ['image'],
        Models\Service::class => ['image', 'gallery'], Models\ServiceCategory::class => ['image'],
        Models\ServiceMaster::class => ['avatar'], Models\ServiceExtra::class => ['image'],
        Models\ChatWidgetConfig::class => ['assistant_avatar_url'], Models\KnowledgeDocument::class => ['file_path'],
        Models\InquiryAttachment::class => ['url'], Models\LandingPage::class => ['content', 'seo'],
        Models\LandingPageSection::class => ['content'], Models\ContentPlannerAsset::class => ['file_path'],
        Models\ContentPlannerVisualBrief::class => ['image_url'], Models\HotelSetting::class => ['value'],
    ];
    private const SETTINGS = ['company_logo', 'booking_widget_logo_url'];

    public function __construct(private ObjectStore $objects, private Archive $archive, private Migration $migration) {}

    public function run(bool $apply): array
    {
        $this->migration->targets();
        return Mutex::run('cloud-media-urls', function () use ($apply) {
            if ($apply && $this->archive->health((string) config('media.cloud_disk')) !== 'ok') throw new \RuntimeException('media_recovery_acceptance_required');
            [$map, $private] = $this->verifiedMap();
            if (!$map && !$private) throw new \RuntimeException('media_verified_migration_missing');
            $totals = ['applied' => $apply, 'rows' => 0, 'references' => 0, 'private_review' => 0, 'unmapped' => 0, 'local_legacy' => 0, 'stale_rows' => 0, 'tables' => []];
            foreach (self::FIELDS as $class => $fields) {
                $model = new $class; $table = $model->getTable();
                if (!Schema::hasTable($table)) continue;
                $fields = array_values(array_filter($fields, fn ($field) => Schema::hasColumn($table, $field)));
                if (!$fields) continue;
                $select = ['id', ...$fields];
                if (Schema::hasColumn($table, 'organization_id')) $select[] = 'organization_id';
                if ($class === Models\HotelSetting::class) $select[] = 'key';
                $query = $class::withoutGlobalScopes()->select($select);
                if ($class === Models\HotelSetting::class) $query->whereIn('key', self::SETTINGS);
                $stats = ['rows' => 0, 'references' => 0, 'private_review' => 0, 'unmapped' => 0, 'local_legacy' => 0];
                $scanned = 0;
                foreach ($query->lazyById(200) as $row) {
                    if (++$scanned > 100000) throw new \RuntimeException('media_reference_scan_incomplete');
                    $before = []; $changes = []; $count = 0;
                    foreach ($fields as $field) {
                        $before[$field] = $row->getAttribute($field);
                        $after = $this->replace($before[$field], $map, $private, $stats, $count);
                        if ($after !== $before[$field]) $changes[$field] = $after;
                    }
                    if (!$changes) continue;
                    if ($apply) {
                        $saved = DB::transaction(function () use ($class, $row, $select, $changes, $before) {
                            $current = $class::withoutGlobalScopes()->whereKey($row->getKey())->select($select)->lockForUpdate()->first();
                            if (!$current) return false;
                            foreach ($before as $field => $value) if ($current->getAttribute($field) !== $value) return false;
                            $current->forceFill($changes)->save(); // Includes the settings/widget cache hooks.
                            return true;
                        });
                        if (!$saved) { $totals['stale_rows']++; continue; }
                    }
                    $stats['rows']++; $stats['references'] += $count;
                }
                foreach (['rows', 'references', 'private_review', 'unmapped', 'local_legacy'] as $key) $totals[$key] += $stats[$key];
                if (array_sum($stats)) $totals['tables'][$table] = $stats;
            }
            return $totals;
        }, 7200);
    }

    private function replace(mixed $value, array $map, array $private, array &$stats, int &$count): mixed
    {
        if (is_array($value)) {
            foreach ($value as $key => $child) $value[$key] = $this->replace($child, $map, $private, $stats, $count);
            return $value;
        }
        if (!is_string($value)) return $value;
        if (isset($map[$value])) { $count++; return $map[$value]; }
        if (str_starts_with($value, '/storage/')) $stats['local_legacy']++;
        if (isset($private[$value])) $stats['private_review']++;
        elseif (str_contains($value, rtrim((string) config('filesystems.disks.do.url'), '/').'/')) $stats['unmapped']++;
        return $value;
    }

    /** Verify every mapped live object and its private bytes before taking any database row lock. */
    private function verifiedMap(): array
    {
        $public = (string) config('media.cloud_disk');
        $prefix = dirname($this->migration->manifestKey('sentinel')).'/';
        $map = []; $private = []; $count = 0;
        $from = rtrim((string) config('filesystems.disks.do.url'), '/');
        $to = rtrim((string) config('filesystems.disks.'.$public.'.url'), '/');
        if (parse_url($from, PHP_URL_SCHEME) !== 'https' || parse_url($to, PHP_URL_SCHEME) !== 'https') throw new \RuntimeException('media_url_base_invalid');
        foreach ($this->objects->files($this->archive->privateDisk(), $prefix) as $path) {
            if (!str_ends_with($path, '.json')) continue;
            if (++$count > 20000) throw new \RuntimeException('media_migration_manifest_incomplete');
            $copy = $this->objects->snapshot($this->archive->privateDisk(), $path, 16384);
            try { $manifest = json_decode(stream_get_contents($copy['stream']), true, 32, JSON_THROW_ON_ERROR); }
            finally { fclose($copy['stream']); }
            if (($manifest['schema'] ?? null) !== 1 || ($manifest['source'] ?? null) !== $this->objects->identity('do')
                || ($manifest['destination'] ?? null) !== $this->objects->identity($public)
                || !is_string($manifest['key'] ?? null) || !Location::safeKey($manifest['key'])
                || $this->migration->manifestKey($manifest['key']) !== $path
                || !preg_match('/^[a-f0-9]{64}$/D', $manifest['sha256'] ?? '')
                || !in_array($manifest['source_visibility'] ?? null, ['public', 'private_review'], true)) throw new \RuntimeException('media_migration_manifest_invalid');
            $key = $manifest['key'];
            if ($manifest['source_visibility'] === 'private_review') { $private[$from.'/'.$key] = true; continue; }
            $recordKey = $this->archive->recordKey($public, $key, $manifest['sha256']);
            $this->archive->readRecord($public, $recordKey);
            if (!$this->objects->matches($public, $key, $manifest['sha256'])
                || !$this->objects->matches($this->archive->privateDisk(), substr($recordKey, 0, -5).'.bin', $manifest['sha256'])) throw new \RuntimeException('media_migration_copy_changed');
            $map[$from.'/'.$key] = $to.'/'.$key;
        }
        return [$map, $private];
    }
}
