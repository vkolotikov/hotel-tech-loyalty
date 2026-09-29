<?php

namespace Tests\Unit\Support;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Finder\Finder;

/**
 * A string-keyed Postgres advisory lock is taken in one place,
 * App\Support\AdvisoryLock, behind its driver check. Anywhere else it is a
 * statement the test suite's sqlite cannot run — which is how the stays
 * confirm went untested for a year. BrandController's two-integer form
 * `pg_advisory_xact_lock(?, ?)` is a different statement and is left alone.
 */
class AdvisoryLockOnlyTest extends TestCase
{
    public function test_the_string_keyed_lock_statement_appears_only_in_the_helper(): void
    {
        $offenders = [];
        foreach ((new Finder())->files()->in(dirname(__DIR__, 3) . '/app')->name('*.php') as $file) {
            if (str_contains($file->getContents(), 'pg_advisory_xact_lock(hashtext(') && $file->getFilename() !== 'AdvisoryLock.php') {
                $offenders[] = $file->getRelativePathname();
            }
        }

        $this->assertSame([], $offenders);
    }
}
