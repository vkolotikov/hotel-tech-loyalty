<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;

/*
 * Rector rewrites code mechanically for an upgrade. It is used in dry-run first, one upgrade at a time
 * (docs/audits/2026-10-31-stack-audit-and-upgrade-plan.md), and its changes ship like any other change:
 * reviewed, tested, deployed by the source-patch recipe. CI does not run it.
 *
 *   vendor/bin/rector process --dry-run      what it would change
 *   vendor/bin/rector process                apply
 *
 * The set enabled now prepares the PHPUnit 12 step (phase 4a): PHPUnit 12 no longer reads doc-comment
 * annotations, so the remaining @dataProvider / @testWith become attributes. Add the next step's set when
 * that step starts, not before.
 */
return RectorConfig::configure()
    ->withPaths([__DIR__.'/tests'])
    ->withAttributesSets(phpunit: true);
