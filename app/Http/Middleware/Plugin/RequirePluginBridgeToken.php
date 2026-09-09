<?php

namespace App\Http\Middleware\Plugin;

use App\Http\Middleware\SaasAuthMiddleware;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RequirePluginBridgeToken
{
    public function handle(Request $request, Closure $next): Response
    {
        // A web cookie alone cannot grant OAuth authorization. The user's app
        // token must be validated by the existing SaaS/Sanctum chain as well.
        abort_unless($request->bearerToken(), 401, 'Sign in to Hexa-Tech to continue.');

        $guards = config('sanctum.guard');
        $web = Auth::guard('web');
        $webSessionKey = $web->getName();
        $previousWebId = $request->session()->get($webSessionKey);
        config(['sanctum.guard' => []]);
        Auth::guard('sanctum')->forgetUser();
        Auth::shouldUse('web');

        try {
            // Keep the bearer-only setup and the existing authentication chain
            // together so Laravel's middleware priority cannot reorder them.
            return app(SaasAuthMiddleware::class)->handle($request, function (Request $request) use ($next) {
                $user = Auth::guard('sanctum')->user();
                abort_unless($user, 401, 'Sign in to Hexa-Tech to continue.');
                $request->setUserResolver(fn () => $user);

                return $next($request);
            });
        } finally {
            // SaaS authentication logs into the default guard. The bridge must
            // neither create nor replace an admin web session as a side effect.
            if ($previousWebId === null) {
                $request->session()->forget($webSessionKey);
            } else {
                $request->session()->put($webSessionKey, $previousWebId);
            }
            $web->forgetUser();
            config(['sanctum.guard' => $guards]);
        }
    }
}
