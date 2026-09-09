<?php

namespace App\Http\Middleware\Plugin;

use Closure;
use Illuminate\Http\Request;
use Laravel\Passport\Passport;
use Symfony\Component\HttpFoundation\Response;

class SerializePluginGrant
{
    public function handle(Request $request, Closure $next): Response
    {
        $client = Passport::client();

        // Disconnect takes this same lock. Validation and minting must happen
        // inside it so an in-flight refresh cannot resurrect a revoked grant.
        return $client->getConnection()->transaction(function () use ($client, $request, $next) {
            abort_unless($client->newQuery()->whereKey(config('chatgpt.client_id'))->lockForUpdate()->first(),
                400, 'The connection is not configured.');

            return $next($request);
        });
    }
}
