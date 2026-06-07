<?php

namespace App\Exceptions;

/**
 * Thrown by service-level gates when the caller's org isn't entitled to
 * a plan feature. The HTTP exception renderer in bootstrap/app.php
 * surfaces this as a 402 Payment Required with a structured body
 * matching what RequireFeature middleware returns at the route level —
 * so the SPA's upgrade-prompt UX is identical regardless of whether the
 * gate fired at route-resolve time or inside controller/service code.
 *
 * Use this for code paths NOT covered by route middleware (background
 * jobs, internal service-to-service calls, controller fan-outs that
 * dispatch work without re-entering the HTTP router). Route-level
 * gating via the `feature:` middleware alias is preferred wherever it
 * fits.
 *
 * The companion AiModelNotAllowed exception is the model-specific
 * variant; this is the broader feature-flag variant. Both render via
 * the same 402 path.
 */
class FeatureNotEntitled extends \RuntimeException
{
    public function __construct(
        public readonly string $feature,
        public readonly ?string $planSlug = null,
        ?string $message = null,
    ) {
        parent::__construct($message ?? "Your current plan does not include this feature ({$feature}).");
    }
}
