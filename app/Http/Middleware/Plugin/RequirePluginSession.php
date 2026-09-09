<?php

namespace App\Http\Middleware\Plugin;

use App\OAuth\PluginIdentity;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RequirePluginSession
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('GET')) {
            $bridge = $request->session()->pull('plugin.bridge_ready');
            if (! is_array($bridge) || ($bridge['until'] ?? 0) < time()
                || ($bridge['target'] ?? '') !== hash('sha256', $request->fullUrl())) {
                Auth::guard('plugin-web')->logout();
                $request->session()->forget(['authRequest', 'authToken', 'plugin.consent_user_id', 'plugin.consent_organization_id']);
                $request->session()->put('plugin.authorize_url', $request->fullUrl());

                return redirect()->route('plugin.login');
            }
        }
        $user = Auth::guard('plugin-web')->user();
        if (! $user) {
            if ($request->isMethod('GET')) {
                $request->session()->put('plugin.authorize_url', $request->fullUrl());

                return redirect()->route('plugin.login');
            }

            abort(401, 'Sign in again before authorizing access.');
        }
        abort_unless(PluginIdentity::active($user),
            403, 'An active staff account is required.');

        if (! $request->isMethod('GET')) {
            abort_unless((int) $request->session()->get('plugin.consent_user_id') === (int) $user->id
                && (int) $request->session()->get('plugin.consent_organization_id') === (int) $user->organization_id,
                403, 'The signed-in account changed. Connect again.');
        }

        $response = $next($request);
        if ($request->isMethod('GET') && $request->session()->has('authRequest')) {
            $request->session()->put('plugin.consent_user_id', $user->id);
            $request->session()->put('plugin.consent_organization_id', $user->organization_id);
        }

        return $response;
    }
}
