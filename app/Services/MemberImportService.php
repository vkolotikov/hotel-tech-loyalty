<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\MemberImportBatch;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * CSV import of existing customers into the loyalty programme.
 *
 * Extracted from MemberAdminController, which parsed and inserted inline
 * and could not survive a real migration file. The old path stopped dead
 * at 500 rows while still reporting "500 of 500 imported", so a 5 000-row
 * onboarding looked like a complete success and silently dropped 90% of
 * the customer base.
 *
 * What this service guarantees that the inline version did not:
 *
 *  - Reads the whole file. Rows are streamed, not buffered into one array
 *    that a cap has to protect.
 *  - Tells the truth about size: `file_rows` counts every data row on
 *    disk, and `truncated` is set when the safety ceiling actually bites,
 *    so the UI can refuse to commit a partial import.
 *  - Survives real-world files: UTF-8 BOM (Excel's "CSV UTF-8" default),
 *    semicolon and tab delimiters (European locales), ragged rows with
 *    more fields than headers, and a wide set of column-name synonyms.
 *  - Carries history. These are EXISTING customers: opening balances,
 *    lifetime totals and join dates come across, and every balance is
 *    written through LoyaltyService so the ledger and the expiry buckets
 *    exist. Writing `current_points` directly (as the old code's zero did
 *    by omission) leaves redemption walking a bucket list that isn't there.
 *  - Is re-runnable. Every opening balance carries a deterministic
 *    idempotency key, so re-importing the same file credits nobody twice.
 */
class MemberImportService
{
    /**
     * Safety ceiling. Not a product limit — it exists so a malformed or
     * malicious upload can't exhaust memory. Well clear of the ~5 000-row
     * migrations this was built for; when it does bite, the caller is told.
     */
    public const MAX_ROWS = 25000;

    /** Rows per DB transaction on commit. */
    private const CHUNK = 100;

    /**
     * Canonical column => accepted header spellings.
     *
     * Operators export from Mews, Opera, Excel, Shopify and homegrown
     * systems; demanding an exact header is how an import project stalls
     * for a week. Matching is done on a lowercased, punctuation-stripped
     * form so "First Name", "first_name" and "FIRSTNAME" all land.
     */
    private const ALIASES = [
        'name'              => ['name', 'fullname', 'full name', 'membername', 'customername', 'guestname', 'client'],
        'first_name'        => ['firstname', 'first', 'givenname', 'forename'],
        'last_name'         => ['lastname', 'last', 'surname', 'familyname'],
        'email'             => ['email', 'emailaddress', 'mail', 'e mail'],
        'phone'             => ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'telephone', 'tel', 'cell'],
        'tier_name'         => ['tiername', 'tier', 'level', 'membership', 'membershiptier', 'membershiplevel', 'status'],
        'points'            => ['points', 'currentpoints', 'balance', 'pointsbalance', 'pointbalance', 'availablepoints'],
        'lifetime_points'   => ['lifetimepoints', 'lifetime', 'totalpoints', 'pointsearned', 'earnedpoints'],
        'joined_at'         => ['joinedat', 'joined', 'joindate', 'membersince', 'signupdate', 'registered', 'registrationdate', 'createdat', 'datejoined'],
        'date_of_birth'     => ['dateofbirth', 'dob', 'birthday', 'birthdate'],
        'marketing_consent' => ['marketingconsent', 'marketing', 'consent', 'optin', 'newsletter', 'subscribed'],
        'external_id'       => ['externalid', 'legacyid', 'customerid', 'customerno', 'membershipno', 'membernumber', 'accountnumber'],
    ];

    /** Delimiters we sniff for, in preference order. */
    private const DELIMITERS = [',', ';', "\t", '|'];

    public function __construct(private QrCodeService $qrCode)
    {
    }

    /**
     * Read a CSV off disk into canonical row arrays.
     *
     * Never throws on bad data — a broken row becomes a `parse_errors`
     * entry carrying its line number, because "row 3172 has too many
     * columns" is actionable and a 500 is not.
     */
    public function parseFile(string $path): array
    {
        $handle = @fopen($path, 'r');
        if (!$handle) {
            return $this->emptyParse('Could not open the uploaded file.');
        }

        $firstLine = fgets($handle);
        if ($firstLine === false || trim($firstLine) === '') {
            fclose($handle);
            return $this->emptyParse('The file is empty.');
        }

        // Excel's "CSV UTF-8" writes a BOM. Left in place it fuses onto the
        // first header ("\xEF\xBB\xBFname"), which never matches `name`, so
        // every single row fails with "invalid email" and the operator has
        // no way to see why.
        $firstLine = preg_replace('/^\xEF\xBB\xBF/', '', $firstLine);
        $delimiter = $this->sniffDelimiter($firstLine);

        rewind($handle);
        $rawHeaders = fgetcsv($handle, 0, $delimiter, '"', '');
        if (!$rawHeaders) {
            fclose($handle);
            return $this->emptyParse('The file has no header row.');
        }
        $rawHeaders[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $rawHeaders[0]);

        [$headers, $unmapped] = $this->mapHeaders($rawHeaders);
        $width = count($rawHeaders);

        $rows = [];
        $parseErrors = [];
        $fileRows = 0;
        $truncated = false;

        while (($r = fgetcsv($handle, 0, $delimiter, '"', '')) !== false) {
            // fgetcsv yields [null] for a blank line; skip silently rather
            // than reporting thousands of "invalid email" errors for the
            // trailing newlines every spreadsheet export adds.
            if ($r === [null] || (count($r) === 1 && trim((string) $r[0]) === '')) {
                continue;
            }

            $fileRows++;
            if (count($rows) >= self::MAX_ROWS) {
                $truncated = true;
                continue; // keep counting so `file_rows` stays honest
            }

            // array_pad only ever grows. A row with MORE fields than the
            // header made array_combine throw an uncaught ValueError and
            // 500 the whole import — one stray comma in a customer's
            // address killed the entire migration with no line number.
            $vals = array_slice(array_pad($r, $width, null), 0, $width);

            try {
                $rows[] = ['__line' => $fileRows + 1] + array_combine($headers, $vals);
            } catch (\Throwable $e) {
                $parseErrors[] = [
                    'line'   => $fileRows + 1,
                    'reason' => 'Could not read this row (' . count($r) . ' values for ' . $width . ' columns).',
                ];
            }
        }
        fclose($handle);

        return [
            'headers'      => array_values(array_filter($headers, fn ($h) => !str_starts_with($h, '__'))),
            'unmapped'     => $unmapped,
            'delimiter'    => $delimiter,
            'rows'         => $rows,
            'file_rows'    => $fileRows,
            'truncated'    => $truncated,
            'parse_errors' => $parseErrors,
            'error'        => null,
        ];
    }

    /**
     * Process the next slice of a batch and record progress.
     *
     * Chunked because a 5 000-member import is ~12 minutes of database work
     * — every member is an insert plus a membership row plus a real ledger
     * entry — and no HTTP request lives that long. Each call is bounded,
     * commits what it did, and returns where it got to, so the operator sees
     * a progress bar and a closed tab loses nothing.
     */
    public function processChunk(MemberImportBatch $batch, int $size = 100): MemberImportBatch
    {
        if ($batch->isFinished()) {
            return $batch;
        }

        $parsed = $this->parseFile($batch->stored_path);
        if ($parsed['error']) {
            $batch->update([
                'status'        => 'failed',
                'error_message' => $parsed['error'],
                'completed_at'  => now(),
            ]);
            return $batch;
        }

        $offset = (int) $batch->processed;
        $slice = array_slice($parsed['rows'], $offset, $size);

        if ($slice === []) {
            $batch->update(['status' => 'completed', 'completed_at' => now()]);
            return $batch;
        }

        if ($batch->status === 'pending') {
            $batch->update(['status' => 'running', 'started_at' => now()]);
        }

        // Re-derive the plan headroom every chunk: other staff may have added
        // members while this import was running.
        $usage = app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_MEMBERS);
        $capRemaining = $usage['limit'] !== null
            ? max(0, (int) $usage['limit'] - (int) $usage['count'])
            : PHP_INT_MAX;

        $report = $this->process(
            rows: $slice,
            dryRun: false,
            orgId: (int) $batch->organization_id,
            capRemaining: $capRemaining,
            planLimit: $usage['limit'],
            batchId: $batch->uuid,
        );

        // Keep only a bounded tail of per-row verdicts: a 25 000-row file
        // would otherwise build a payload no browser can render, and the
        // rows an operator acts on are the failures.
        $existing = $batch->results ?? [];
        $notable = array_values(array_filter($report['rows'], fn ($r) => ($r['status'] ?? '') !== 'ok'));
        $merged = array_slice(array_merge($existing, $notable), -500);

        $batch->forceFill([
            'processed'      => $offset + count($slice),
            'ok_count'       => (int) $batch->ok_count + $report['ok'],
            'skip_count'     => (int) $batch->skip_count + $report['skip'],
            'error_count'    => (int) $batch->error_count + $report['error'],
            'points_awarded' => (int) $batch->points_awarded + $report['points_awarded'],
            'results'        => $merged,
        ]);

        if ($batch->processed >= $batch->total_rows) {
            $batch->status = 'completed';
            $batch->completed_at = now();
        }
        $batch->save();

        return $batch;
    }

    /**
     * Validate — and, unless `$dryRun`, create — members from parsed rows.
     *
     * `$capRemaining` is the plan's remaining member allowance. It is applied
     * during the dry run too, so the preview an operator approves is exactly
     * what a commit produces.
     */
    public function process(
        array $rows,
        bool $dryRun,
        int $orgId,
        int $capRemaining,
        ?int $planLimit = null,
        ?string $batchId = null,
    ): array {
        $batchId ??= (string) Str::uuid();

        $tiersByName = LoyaltyTier::all()->keyBy(fn ($t) => Str::lower(trim((string) $t->name)));
        $defaultTier = LoyaltyTier::where('name', 'Bronze')->first()
            ?? LoyaltyTier::orderBy('min_points')->first();

        $results = [];
        $okCount = 0;
        $skipCount = 0;
        $errCount = 0;
        $pointsAwarded = 0;

        $seenEmails = [];
        $pending = [];

        // One query instead of one per row. The old code called
        // generateMemberNumber() inside the loop, and that does a full-table
        // COUNT(*) every time — quadratic against a table the import itself
        // is growing.
        $numbers = $this->allocateMemberNumbers(count($rows));
        $numberCursor = 0;

        // Likewise for "is this email already a member?": one query per row
        // is 5 000 round-trips and dominated the whole import. Resolve every
        // address in the file up front in chunked IN() lookups instead.
        $existingEmails = $this->existingEmails($rows);

        foreach ($rows as $row) {
            $line = (int) ($row['__line'] ?? 0);
            $parsed = $this->normaliseRow($row);

            if ($parsed['name'] === '' || !filter_var($parsed['email'], FILTER_VALIDATE_EMAIL)) {
                $results[] = $this->row($line, $parsed['email'], 'error', $parsed['email'] === ''
                    ? 'No email address in this row'
                    : ($parsed['name'] === '' ? 'No name in this row' : 'That email address is not valid'));
                $errCount++;
                continue;
            }

            if (isset($seenEmails[$parsed['email']])) {
                $results[] = $this->row($line, $parsed['email'], 'skip',
                    'Appears earlier in this file (line ' . $seenEmails[$parsed['email']] . ')');
                $skipCount++;
                continue;
            }
            $seenEmails[$parsed['email']] = $line;

            if (isset($existingEmails[$parsed['email']])) {
                $results[] = $this->row($line, $parsed['email'], 'skip', 'Already a member');
                $skipCount++;
                continue;
            }

            $tier = $parsed['tier_name'] !== ''
                ? ($tiersByName[Str::lower($parsed['tier_name'])] ?? null)
                : $defaultTier;

            if (!$tier) {
                $known = $tiersByName->keys()->map(fn ($k) => ucfirst($k))->implode(', ');
                $results[] = $this->row($line, $parsed['email'], 'error',
                    "No tier called '{$parsed['tier_name']}'. Available: {$known}");
                $errCount++;
                continue;
            }

            if ($okCount >= $capRemaining) {
                $results[] = $this->row($line, $parsed['email'], 'skip',
                    'Over your plan member limit' . ($planLimit ? " ({$planLimit})" : ''));
                $skipCount++;
                continue;
            }

            $parsed['tier'] = $tier;
            $parsed['line'] = $line;
            $parsed['member_number'] = $numbers[$numberCursor++] ?? null;

            $results[] = $this->row($line, $parsed['email'], 'ok', null, [
                'tier'   => $tier->name,
                'points' => $parsed['points'],
            ]);
            $okCount++;
            $pointsAwarded += max($parsed['points'], $parsed['lifetime_points']);

            if (!$dryRun) {
                $pending[] = ['result_index' => count($results) - 1] + $parsed;

                if (count($pending) >= self::CHUNK) {
                    $this->flush($pending, $orgId, $batchId, $results, $okCount, $errCount);
                    $pending = [];
                }
            }
        }

        if (!$dryRun && $pending) {
            $this->flush($pending, $orgId, $batchId, $results, $okCount, $errCount);
        }

        return [
            'ok'             => $okCount,
            'skip'           => $skipCount,
            'error'          => $errCount,
            'points_awarded' => $pointsAwarded,
            'batch_id'       => $batchId,
            'rows'           => $results,
        ];
    }

    /**
     * Create one chunk of members.
     *
     * Each member is its own transaction: a single bad row must not roll
     * back the 99 good ones next to it in the chunk.
     */
    private function flush(array $pending, int $orgId, string $batchId, array &$results, int &$okCount, int &$errCount): void
    {
        $loyalty = app(LoyaltyService::class);

        foreach ($pending as $p) {
            try {
                $member = $this->createWithUniqueNumber($p, $orgId);

                // Opening balances go through the ledger, never straight onto
                // the column. Redemption consumes expiry buckets FIFO, so a
                // member whose balance was set directly has points they can
                // see and cannot spend.
                $this->applyOpeningBalance($loyalty, $member, $p, $batchId);

                // Re-assert the operator's tier.
                //
                // awardPoints() runs assessTier(), which recomputes the tier
                // from the points we just imported and overwrites whatever
                // the CSV said. That silently demotes every grandfathered
                // member: a customer the hotel has recorded as Platinum for
                // years but whose points don't reach the Platinum threshold
                // lands back in Bronze on day one.
                //
                // Written straight to the column, deliberately: `$member` is
                // a stale in-memory copy by this point (assessTier updated
                // the row, not this instance), so comparing `$member->tier_id`
                // would compare the value we set at create time and never
                // fire. The CSV is the operator's own record and outranks a
                // derived value.
                if ($p['tier_name'] !== '') {
                    LoyaltyMember::withoutGlobalScopes()
                        ->whereKey($member->id)
                        ->update(['tier_id' => $p['tier']->id]);
                }
            } catch (\Throwable $e) {
                Log::warning('member_import row failed', [
                    'line'  => $p['line'],
                    'email' => $p['email'],
                    'error' => $e->getMessage(),
                ]);
                $results[$p['result_index']] = $this->row(
                    $p['line'], $p['email'], 'error',
                    'Could not create: ' . Str::limit($e->getMessage(), 160)
                );
                $okCount--;
                $errCount++;
            }
        }
    }

    /**
     * Create the user + membership, retrying if the member number is taken.
     *
     * Member numbers are allocated in blocks per import, so two imports
     * running at once - two admins, or a retried chunk overlapping a live
     * one - hand out the same numbers and the unique index rejects the
     * loser. Failing the row for that would be wrong: nothing is actually
     * duplicated, the number just needs to be re-drawn.
     */
    private function createWithUniqueNumber(array $p, int $orgId): LoyaltyMember
    {
        $number = $p['member_number'] ?: $this->qrCode->generateMemberNumber();

        for ($attempt = 0; ; $attempt++) {
            try {
                return DB::transaction(function () use ($p, $orgId, $number) {
                    // Raw insert, deliberately not User::create(): the model
                    // casts `password` as `hashed`, so any plaintext handed
                    // to it gets bcrypt'd at 12 rounds - ~300ms per row, on
                    // its own enough to push a 5 000-row import past every
                    // proxy timeout.
                    //
                    // The stored value is intentionally NOT a valid hash.
                    // Imported customers have never chosen a password and
                    // reach the app through the reset flow, so there is
                    // nothing to verify against; a string bcrypt can never
                    // match is strictly safer than a shared known secret.
                    $userId = DB::table('users')->insertGetId([
                        'name'            => $p['name'],
                        'email'           => $p['email'],
                        'password'        => '!imported:' . Str::random(48),
                        'phone'           => $p['phone'],
                        'date_of_birth'   => $p['date_of_birth'],
                        'user_type'       => 'member',
                        'language'        => 'en',
                        // Without this the row is invisible to TenantScope,
                        // which fails closed - the member could log in and
                        // then see nothing at all, while the admin list
                        // showed them as perfectly healthy.
                        'organization_id' => $orgId,
                        'created_at'      => now(),
                        'updated_at'      => now(),
                    ]);

                    return LoyaltyMember::create([
                        'user_id'           => $userId,
                        'organization_id'   => $orgId,
                        'tier_id'           => $p['tier']->id,
                        'member_number'     => $number,
                        'qr_code_token'     => Str::random(64),
                        'referral_code'     => $this->qrCode->generateReferralCode(),
                        'lifetime_points'   => 0,
                        'current_points'    => 0,
                        'is_active'         => true,
                        'marketing_consent' => $p['marketing_consent'] ?? false,
                        'joined_at'         => $p['joined_at'] ?? now(),
                    ]);
                });
            } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
                if ($attempt >= 5 || !str_contains($e->getMessage(), 'member_number')) {
                    throw $e;
                }
                // Re-draw above whatever is now the highest in use. The
                // random jump keeps two racing importers from settling on
                // the same replacement.
                $number = $this->nextFreeMemberNumber();
            }
        }
    }

    /** A number above every one currently in use, jittered against races. */
    private function nextFreeMemberNumber(): string
    {
        $prefix = sprintf('HL-%d-', now()->year);

        $highest = (int) (DB::table('loyalty_members')
            ->where('member_number', 'like', $prefix . '%')
            ->selectRaw('max(cast(substring(member_number from ' . (strlen($prefix) + 1) . ') as integer)) m')
            ->value('m') ?? 0);

        return $prefix . sprintf('%06d', $highest + random_int(1, 25));
    }

    /**
     * Reproduce a customer's historical position in the ledger.
     *
     * `lifetime` is what they ever earned and `current` what they still
     * hold; the gap is what they already spent. Awarding the lifetime total
     * and then redeeming the difference reconstructs both numbers with real
     * transactions and real expiry buckets behind them, so tier assessment,
     * expiry and redemption all behave as if the history had happened here.
     */
    private function applyOpeningBalance(LoyaltyService $loyalty, LoyaltyMember $member, array $p, string $batchId): void
    {
        $current  = max(0, (int) $p['points']);
        $lifetime = max(0, (int) $p['lifetime_points']);

        // Only a balance was supplied — treat it as both earned and held.
        if ($lifetime === 0 && $current > 0) {
            $lifetime = $current;
        }
        // Lifetime below the live balance is incoherent; trust the balance.
        if ($lifetime < $current) {
            $lifetime = $current;
        }
        if ($lifetime === 0) {
            return;
        }

        $key = 'import_' . $batchId . '_' . sha1($p['email']);

        $loyalty->awardPoints(
            member: $member,
            points: $lifetime,
            description: 'Opening balance (imported)',
            type: 'adjust',
            reasonCode: 'import_opening_balance',
            sourceType: 'import',
            idempotencyKey: $key . '_open',
        );

        $spent = $lifetime - $current;
        if ($spent > 0) {
            $loyalty->redeemPoints(
                member: $member->fresh(),
                points: $spent,
                description: 'Previously redeemed before import',
                reasonCode: 'import_opening_spent',
                idempotencyKey: $key . '_spent',
            );
        }
    }

    /**
     * Reserve a block of member numbers up front.
     *
     * generateMemberNumber() counts the whole table per call, so calling it
     * per row is O(n²) against a table the import is actively growing.
     */
    private function allocateMemberNumbers(int $count): array
    {
        if ($count <= 0) {
            return [];
        }

        $year = now()->year;
        $prefix = sprintf('HL-%d-', $year);

        $taken = [];
        $highest = 0;
        foreach (
            LoyaltyMember::withoutGlobalScopes()
                ->where('member_number', 'like', $prefix . '%')
                ->pluck('member_number') as $existing
        ) {
            $taken[$existing] = true;
            $suffix = (int) substr((string) $existing, strlen($prefix));
            if ($suffix > $highest) {
                $highest = $suffix;
            }
        }

        // Start above the highest number actually in use, NOT at the row
        // count. The two diverge the moment any member is deleted or the
        // table holds numbers from another year's prefix, and the count-based
        // seed then hands out numbers that already exist — the unique index
        // rejects them and those rows fail mid-import with a raw Postgres
        // error. QrCodeService::generateMemberNumber() has the same flaw,
        // which is why the fallback in flush() is a last resort, not a plan.
        $numbers = [];
        $seq = $highest;
        $ceiling = $highest + $count + 10000;

        while (count($numbers) < $count && $seq < $ceiling) {
            $seq++;
            $candidate = $prefix . sprintf('%06d', $seq);
            if (!isset($taken[$candidate])) {
                $numbers[] = $candidate;
            }
        }

        return $numbers;
    }

    /**
     * Which of this file's addresses are already users?
     *
     * Chunked so the IN() list never approaches Postgres' parameter limit.
     */
    private function existingEmails(array $rows): array
    {
        $emails = [];
        foreach ($rows as $row) {
            $e = Str::lower(trim((string) ($row['email'] ?? '')));
            if ($e !== '') {
                $emails[$e] = true;
            }
        }
        if ($emails === []) {
            return [];
        }

        $found = [];
        foreach (array_chunk(array_keys($emails), 1000) as $chunk) {
            foreach (User::withoutGlobalScopes()->whereIn('email', $chunk)->pluck('email') as $e) {
                $found[Str::lower($e)] = true;
            }
        }

        return $found;
    }

    /** Pull one CSV row into canonical, typed fields. */
    private function normaliseRow(array $row): array
    {
        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '') {
            $name = trim(trim((string) ($row['first_name'] ?? '')) . ' ' . trim((string) ($row['last_name'] ?? '')));
        }

        return [
            'name'              => $name,
            'email'             => Str::lower(trim((string) ($row['email'] ?? ''))),
            'phone'             => trim((string) ($row['phone'] ?? '')) ?: null,
            'tier_name'         => trim((string) ($row['tier_name'] ?? '')),
            'points'            => $this->toInt($row['points'] ?? null),
            'lifetime_points'   => $this->toInt($row['lifetime_points'] ?? null),
            'joined_at'         => $this->toDate($row['joined_at'] ?? null),
            'date_of_birth'     => $this->toDate($row['date_of_birth'] ?? null),
            'marketing_consent' => $this->toBool($row['marketing_consent'] ?? null),
            'external_id'       => trim((string) ($row['external_id'] ?? '')) ?: null,
        ];
    }

    /**
     * "1 250", "1,250", "1250.00", "1.250,00" and "€1,250" all mean 1250.
     *
     * Stripping every non-digit is not good enough here: it turns the very
     * common "1250.00" into 125 000, silently crediting a customer a hundred
     * times their real balance across the whole import. So the decimal
     * separator has to be identified before anything is removed.
     */
    private function toInt(mixed $v): int
    {
        $s = trim((string) ($v ?? ''));
        if ($s === '') {
            return 0;
        }

        $negative = str_starts_with($s, '-');
        // Drop currency symbols, spaces and non-breaking spaces.
        $s = preg_replace('/[^0-9.,]/', '', $s) ?? '';
        if ($s === '') {
            return 0;
        }

        $lastDot = strrpos($s, '.');
        $lastComma = strrpos($s, ',');

        if ($lastDot !== false && $lastComma !== false) {
            // Both present: whichever comes last is the decimal separator
            // ("1,250.75" US vs "1.250,75" European).
            $decimalPos = max($lastDot, $lastComma);
        } elseif ($lastDot !== false || $lastComma !== false) {
            $pos = $lastDot !== false ? $lastDot : $lastComma;
            $trailing = strlen($s) - $pos - 1;
            // Exactly three trailing digits and no other separator is a
            // thousands group ("1,250" / "1.250"); anything else is a
            // decimal fraction.
            $isThousands = $trailing === 3 && substr_count($s, $s[$pos]) === 1;
            $decimalPos = $isThousands ? null : $pos;
        } else {
            $decimalPos = null;
        }

        if ($decimalPos === null) {
            $whole = preg_replace('/\D/', '', $s) ?? '';
            $value = $whole === '' ? 0 : (int) $whole;
        } else {
            $whole = preg_replace('/\D/', '', substr($s, 0, $decimalPos)) ?? '';
            $frac = preg_replace('/\D/', '', substr($s, $decimalPos + 1)) ?? '';
            $value = (int) round(((float) ($whole === '' ? '0' : $whole)) + (float) ('0.' . ($frac === '' ? '0' : $frac)));
        }

        return $negative ? -$value : $value;
    }

    private function toDate(mixed $v): ?Carbon
    {
        $v = trim((string) ($v ?? ''));
        if ($v === '') {
            return null;
        }

        // Shape-match first, then build exactly one Carbon. Cascading
        // through candidate formats inside try/catch costs an exception per
        // miss, and at two date columns x 5 000 rows that alone was most of
        // the import's runtime.
        //
        // Day-first is deliberate: European exports write 03/11/2024 for
        // 3 November, and reading that as 11 March silently corrupts every
        // join date in the file. ISO (yyyy-first) is unambiguous and checked
        // first; a day > 12 disambiguates on its own; otherwise day-first
        // wins because that is what the non-US exports mean.
        if (preg_match('/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/', $v, $m)) {
            [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } elseif (preg_match('/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/', $v, $m)) {
            [$d, $mo, $y] = [(int) $m[1], (int) $m[2], (int) $m[3]];
            if ($d <= 12 && $mo > 12) {
                [$d, $mo] = [$mo, $d]; // unambiguously month-first
            }
            if ($y < 100) {
                $y += $y < 70 ? 2000 : 1900;
            }
        } else {
            try {
                return Carbon::parse($v)->startOfDay();
            } catch (\Throwable) {
                return null;
            }
        }

        if ($mo < 1 || $mo > 12 || $d < 1 || $d > 31 || !checkdate($mo, $d, $y)) {
            return null;
        }

        return Carbon::create($y, $mo, $d, 0, 0, 0);
    }

    private function toBool(mixed $v): bool
    {
        $v = Str::lower(trim((string) ($v ?? '')));
        return in_array($v, ['1', 'true', 'yes', 'y', 't', 'on', 'consent', 'subscribed'], true);
    }

    /**
     * Match a file's headers to canonical names.
     *
     * Anything unrecognised is returned in `$unmapped` so the UI can show
     * "we ignored these columns" rather than dropping data in silence.
     */
    private function mapHeaders(array $rawHeaders): array
    {
        $lookup = [];
        foreach (self::ALIASES as $canonical => $spellings) {
            foreach ($spellings as $s) {
                $lookup[$this->fold($s)] = $canonical;
            }
            $lookup[$this->fold($canonical)] = $canonical;
        }

        $headers = [];
        $unmapped = [];
        $used = [];

        foreach ($rawHeaders as $i => $raw) {
            $folded = $this->fold((string) $raw);
            $canonical = $lookup[$folded] ?? null;

            // A second column mapping to the same field (e.g. both "mobile"
            // and "phone") keeps the first and is reported, not silently
            // overwritten by array_combine.
            if ($canonical !== null && !isset($used[$canonical])) {
                $used[$canonical] = true;
                $headers[] = $canonical;
            } else {
                $headers[] = '__unused_' . $i;
                if (trim((string) $raw) !== '') {
                    $unmapped[] = (string) $raw;
                }
            }
        }

        return [$headers, $unmapped];
    }

    /** Lowercase, strip everything that isn't a letter or digit. */
    private function fold(string $s): string
    {
        return preg_replace('/[^a-z0-9]/', '', Str::lower(trim($s))) ?? '';
    }

    private function sniffDelimiter(string $headerLine): string
    {
        $best = ',';
        $bestCount = 0;
        foreach (self::DELIMITERS as $d) {
            $count = substr_count($headerLine, $d);
            if ($count > $bestCount) {
                $bestCount = $count;
                $best = $d;
            }
        }
        return $best;
    }

    private function row(int $line, string $email, string $status, ?string $reason, array $extra = []): array
    {
        return array_filter([
            'line'   => $line,
            'email'  => $email,
            'status' => $status,
            'reason' => $reason,
        ] + $extra, fn ($v) => $v !== null);
    }

    private function emptyParse(string $error): array
    {
        return [
            'headers' => [], 'unmapped' => [], 'delimiter' => ',',
            'rows' => [], 'file_rows' => 0, 'truncated' => false,
            'parse_errors' => [], 'error' => $error,
        ];
    }
}
