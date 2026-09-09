<?php

namespace App\Http\Controllers\Plugin;

use App\Models\PluginUser;
use App\OAuth\PluginIdentity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PluginLoginController
{
    public function show(Request $request)
    {
        abort_unless($request->session()->has('plugin.authorize_url'), 400, 'Start the connection from ChatGPT.');

        return response()->view('plugin.login');
    }

    public function bridge(Request $request)
    {
        $user = $request->user();
        abort_unless(PluginIdentity::active($user),
            403, 'An active Hexa-Tech staff account is required.');
        $target = $request->session()->get('plugin.authorize_url');
        abort_unless(is_string($target) && str_starts_with($target,
            rtrim(config('chatgpt.url'), '/').'/oauth/authorize?'), 400, 'Start the connection again from ChatGPT.');

        Auth::guard('plugin-web')->login(PluginUser::query()->findOrFail($user->id));
        $request->session()->regenerate();
        $request->session()->put('plugin.bridge_ready', [
            'target' => hash('sha256', $target), 'until' => time() + 120,
        ]);

        return response()->json(['redirect' => $target]);
    }
}
