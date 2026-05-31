<?php

namespace App\Console\Commands;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;

/**
 * List every channel in an org's Smoobu account.
 *
 * Pulls GET /api/channels (via SmoobuClient::listChannels) and labels each
 * one Direct / OTA / Manual based on the channel name + flags Smoobu
 * returns. The "Direct" channel is the ONE the booking flow must use when
 * calling Smoobu POST /reservations — bookings attributed to an OTA channel
 * (Booking.com, Airbnb, Vrbo, Expedia, …) are rejected by Smoobu with the
 * generic 404 we keep hitting in production, because OTA channels are
 * sourced from the OTA's own API and are not writeable through Smoobu.
 *
 * Compares against the org's admin-pinned `booking_smoobu_channel_id`
 * (stored in `hotel_settings`) and tells the operator:
 *
 *   ✅  Pinned id matches a Direct/Manual channel — OK to push reservations.
 *   ❌  Pinned id matches an OTA channel          — this is the root cause
 *                                                    of failed createReservation
 *                                                    calls; re-pin to a
 *                                                    Direct channel.
 *   ❌  Pinned id matches no channel               — channel was deleted in
 *                                                    Smoobu since the admin
 *                                                    saved this id.
 *   ⚠   Pinned id is empty                         — Path 1 in
 *                                                    SmoobuClient::resolveDirectChannelId
 *                                                    is skipped; Path 2 will
 *                                                    auto-detect on every call.
 *
 * Read-only (single GET /channels). Safe to run on prod anytime.
 *
 * Usage:
 *   php artisan diag:smoobu-channels --org=12
 *   php artisan diag:smoobu-channels --org=12 --json
 */
class DiagSmoobuChannels extends Command
{
    protected $signature = 'diag:smoobu-channels
                            {--org= : Organization id (required)}
                            {--json : Emit machine-readable JSON instead of a pretty table}';

    protected $description = 'List Smoobu channels for an org; flag the Direct channel and detect mis-pinned booking_smoobu_channel_id.';

    /**
     * Patterns shared with SmoobuClient::resolveDirectChannelId() so the
     * diagnostic and the runtime resolver agree on what "Direct" means.
     */
    private const OTA_NAME_PATTERN     = '/(booking\.?com|airbnb|expedia|vrbo|hotels?\.com|agoda|trip\.com|hostelworld|despegar|hrs|hotelbeds|tripadvisor)/i';
    private const DIRECT_NAME_PATTERN  = '/(direct|website|manual|\bapi\b|own.?website|direct.?booking)/i';
    private const BLOCKED_NAME_PATTERN = '/(blocked|block channel|блок)/i';

    public function handle(SmoobuClient $smoobu): int
    {
        $orgId = (int) $this->option('org');
        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant so SmoobuClient picks up THIS org's API key + so
        // hotel_settings reads are scoped.
        app()->instance('current_organization_id', $orgId);

        if ($smoobu->isMock()) {
            $this->warn("SmoobuClient is in MOCK mode for org {$orgId} — channels returned are synthetic placeholders, not the real account.");
        }

        // ── Pull the channel list ──
        try {
            $resp = $smoobu->listChannels();
        } catch (\Throwable $e) {
            $this->error('Smoobu GET /channels failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $items = is_array($resp['channels'] ?? null) ? $resp['channels'] : [];

        // ── Read the admin-pinned channel id from hotel_settings ──
        // Use Eloquent so the encrypted-value accessor would run if the
        // key were ever in ENCRYPTED_KEYS. booking_smoobu_channel_id is
        // plaintext today, so this is just consistency with the rest of
        // the codebase.
        $pinnedRow = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'booking_smoobu_channel_id')
            ->first();
        $pinnedRaw = $pinnedRow && $pinnedRow->value !== null ? trim((string) $pinnedRow->value) : '';
        $pinnedId  = $pinnedRaw !== '' ? (int) $pinnedRaw : 0;

        // ── Classify each channel ──
        $classified = [];
        foreach ($items as $ch) {
            if (!is_array($ch)) continue;
            $id   = (int) ($ch['id'] ?? 0);
            $name = (string) ($ch['name'] ?? '');
            if ($id <= 0) continue;

            $declaredBlocked = (bool) ($ch['is_blocked_channel'] ?? $ch['blocked'] ?? false);
            $isBlocked = $declaredBlocked || preg_match(self::BLOCKED_NAME_PATTERN, $name) === 1;
            $isOta     = preg_match(self::OTA_NAME_PATTERN, $name) === 1;
            $isDirect  = !$isOta && !$isBlocked && (preg_match(self::DIRECT_NAME_PATTERN, $name) === 1);

            // "Manual" bucket = anything that isn't OTA, not blocked, but
            // also doesn't match the direct/website/api naming convention.
            // Smoobu treats these as writeable too, so they're acceptable
            // pin targets even though Direct is preferred.
            $type = $isOta
                ? 'OTA'
                : ($isBlocked ? 'Blocked' : ($isDirect ? 'Direct' : 'Manual'));

            // Smoobu lets you POST /reservations to Direct + Manual
            // channels. OTA + Blocked reject — the OTA is the source of
            // truth for its own bookings.
            $bookableViaApi = in_array($type, ['Direct', 'Manual'], true);

            $note = match ($type) {
                'OTA'     => 'Smoobu does not allow API writes to OTA channels — use only for reads.',
                'Blocked' => 'Blocked channel — Smoobu rejects writes.',
                'Direct'  => 'Pin this id in Settings → Integrations → Smoobu channel_id.',
                'Manual'  => 'Writeable but not auto-detected. Pin only if you know this is your direct-booking channel.',
                default   => '',
            };

            $classified[] = [
                'id'              => $id,
                'name'            => $name !== '' ? $name : '—',
                'type'            => $type,
                'bookable_via_api'=> $bookableViaApi,
                'note'            => $note,
                'is_pinned'       => $pinnedId > 0 && $id === $pinnedId,
            ];
        }

        // Sort: Direct first, then Manual, then OTA, then Blocked — easiest
        // to scan when the answer is at the top.
        $order = ['Direct' => 0, 'Manual' => 1, 'OTA' => 2, 'Blocked' => 3];
        usort($classified, fn($a, $b) => ($order[$a['type']] ?? 9) <=> ($order[$b['type']] ?? 9));

        // ── Decide the pinned-id verdict ──
        $verdict = $this->buildVerdict($pinnedId, $classified);

        // ── JSON mode ──
        if ($this->option('json')) {
            $this->line(json_encode([
                'org_id'             => $orgId,
                'org_name'           => $org->name,
                'mock_mode'          => $smoobu->isMock(),
                'pinned_channel_id'  => $pinnedId,
                'channels'           => $classified,
                'verdict'            => $verdict,
                'generated_at'       => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return $verdict['status'] === 'ok' ? self::SUCCESS : self::FAILURE;
        }

        // ── Pretty table ──
        $this->info("Smoobu channels for org {$orgId} ({$org->name})");
        $this->line('  admin-pinned booking_smoobu_channel_id = ' . ($pinnedId > 0 ? (string) $pinnedId : '<empty>'));
        $this->newLine();

        if (empty($classified)) {
            // Smoobu's GET /channels isn't part of the public API on most
            // accounts — it returns their marketing homepage HTML (~10KB)
            // on a 200 OK. SmoobuClient::listChannels() detects that and
            // short-circuits to []. Either way (HTML page OR a genuinely
            // empty channels list), the only working configuration is for
            // the admin to pin a channel id manually — auto-detect can't
            // resolve anything against an empty list.
            $this->newLine();
            $this->warn("Smoobu's GET /channels endpoint is not available on this account.");
            $this->line("The admin-pinned channel_id is the only way to configure which channel new reservations are attributed to.");
            $this->line("  Current pinned: " . ($pinnedId > 0 ? (string) $pinnedId : '<empty>'));
            $this->line("Verify in Smoobu admin → Settings → Channels that this matches your Website / Direct channel ID.");
            return self::FAILURE;
        }

        $rows = [];
        foreach ($classified as $c) {
            $typeCell = $this->colorType($c['type']);
            $pinCell  = $c['is_pinned'] ? '<fg=cyan>PINNED</>' : '';
            $rows[] = [
                $c['id'],
                $c['name'],
                $typeCell,
                $c['bookable_via_api'] ? 'yes' : 'no',
                $pinCell,
                $c['note'],
            ];
        }
        $this->table(
            ['ID', 'Name', 'Type', 'Bookable via API', 'Pin', 'Notes'],
            $rows,
        );

        // ── Verdict block ──
        $this->newLine();
        match ($verdict['status']) {
            'ok'         => $this->info('✅  ' . $verdict['message']),
            'warning'    => $this->warn('⚠   ' . $verdict['message']),
            default      => $this->error('❌  ' . $verdict['message']),
        };

        if (!empty($verdict['suggestion'])) {
            $this->newLine();
            $this->line($verdict['suggestion']);
        }

        return $verdict['status'] === 'ok' ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Build the human-readable verdict for the admin-pinned channel id.
     *
     * @param  int $pinnedId
     * @param  array<int, array{id:int,name:string,type:string,bookable_via_api:bool,note:string,is_pinned:bool}> $channels
     * @return array{status:string,message:string,suggestion:string}
     */
    private function buildVerdict(int $pinnedId, array $channels): array
    {
        // Find a Direct candidate to recommend, falling back to a Manual.
        $directCandidate = null;
        $manualCandidate = null;
        foreach ($channels as $c) {
            if ($c['type'] === 'Direct' && $directCandidate === null) {
                $directCandidate = $c;
            }
            if ($c['type'] === 'Manual' && $manualCandidate === null) {
                $manualCandidate = $c;
            }
        }
        $recommend = $directCandidate ?? $manualCandidate;
        $recommendStr = $recommend
            ? "Update Settings → Integrations → Smoobu channel_id to {$recommend['id']} ({$recommend['name']})."
            : 'No Direct or Manual channel found — verify the Smoobu account actually has a direct-booking channel configured.';

        if ($pinnedId === 0) {
            return [
                'status'     => 'warning',
                'message'    => 'No admin-pinned channel id. Path 1 of resolveDirectChannelId is skipped; Path 2 will auto-detect on every booking.',
                'suggestion' => $recommendStr,
            ];
        }

        $match = null;
        foreach ($channels as $c) {
            if ($c['id'] === $pinnedId) {
                $match = $c;
                break;
            }
        }

        if (!$match) {
            return [
                'status'     => 'error',
                'message'    => "Admin-pinned channel id {$pinnedId} does NOT match any channel in this Smoobu account — the channel was probably deleted.",
                'suggestion' => $recommendStr,
            ];
        }

        if ($match['type'] === 'OTA') {
            return [
                'status'     => 'error',
                'message'    => "Admin-pinned channel id {$pinnedId} is an OTA channel ({$match['name']}) — Smoobu rejects API writes to OTA channels. THIS IS THE ROOT CAUSE OF createReservation 404s.",
                'suggestion' => $recommendStr,
            ];
        }

        if ($match['type'] === 'Blocked') {
            return [
                'status'     => 'error',
                'message'    => "Admin-pinned channel id {$pinnedId} is a Blocked channel ({$match['name']}) — Smoobu rejects writes; bookings end up grey on the calendar.",
                'suggestion' => $recommendStr,
            ];
        }

        return [
            'status'     => 'ok',
            'message'    => "Admin-pinned channel id {$pinnedId} matches a {$match['type']} channel ({$match['name']}) — OK to push reservations.",
            'suggestion' => '',
        ];
    }

    /**
     * Colour the Type cell in the table. Symfony Console tags survive
     * inside table cells in modern Laravel.
     */
    private function colorType(string $type): string
    {
        return match ($type) {
            'Direct'  => '<fg=green;options=bold>Direct</>',
            'Manual'  => '<fg=yellow>Manual</>',
            'OTA'     => '<fg=red;options=bold>OTA</>',
            'Blocked' => '<fg=red>Blocked</>',
            default   => $type,
        };
    }
}
