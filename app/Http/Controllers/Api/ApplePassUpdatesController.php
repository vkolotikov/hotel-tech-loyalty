<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{WalletConfig, WalletPass, WalletRegistration};
use App\Services\AppleWalletService;
use App\Services\Wallet\Passes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Apple's pass web-service protocol. These are pass credentials, never member API tokens. */
class ApplePassUpdatesController extends Controller
{
    private function authenticated(Request $request, string $type, string $serial): WalletPass
    {
        $pass = WalletPass::where('provider', 'apple')->where('type_id', $type)->where('serial', $serial)->first();
        $header = $request->header('Authorization', '');
        $token = str_starts_with($header, 'ApplePass ') ? substr($header, 10) : '';
        abort_unless($pass && $token !== '' && hash_equals((string) $pass->authentication_token, $token), 401);
        return $pass;
    }

    private function device(string $device): string
    {
        abort_unless(strlen($device) >= 1 && strlen($device) <= 256, 400);
        return hash('sha256', $device);
    }

    public function register(Request $request, string $device, string $type, string $serial)
    {
        $pass = $this->authenticated($request, $type, $serial);
        $hash = $this->device($device);
        $data = $request->validate(['pushToken' => ['required', 'string', 'regex:/^[a-fA-F0-9]{32,512}$/']]);
        $new = DB::transaction(function () use ($pass, $hash, $data) {
            $locked = WalletPass::whereKey($pass->id)->lockForUpdate()->firstOrFail();
            $registration = WalletRegistration::firstOrNew(['wallet_pass_id' => $pass->id, 'device_hash' => $hash]);
            $new = !$registration->exists;
            abort_if($new && WalletRegistration::where('wallet_pass_id', $pass->id)->count() >= 30, 429);
            $registration->fill(['push_token' => $data['pushToken']])->save();
            $locked->forceFill(['synced_hash' => null, 'next_attempt_at' => null])->save();
            return $new;
        });
        return response('', $new ? 201 : 200)->header('Cache-Control', 'no-store');
    }

    public function unregister(Request $request, string $device, string $type, string $serial)
    {
        $pass = $this->authenticated($request, $type, $serial);
        WalletRegistration::where('wallet_pass_id', $pass->id)->where('device_hash', $this->device($device))->delete();
        return response('', 200)->header('Cache-Control', 'no-store');
    }

    public function changes(Request $request, string $device, string $type)
    {
        $ids = WalletRegistration::where('device_hash', $this->device($device))->pluck('wallet_pass_id');
        $rows = WalletPass::whereIn('id', $ids)->where('provider', 'apple')->where('type_id', $type)->orderBy('id')->get();
        if ($rows->isEmpty()) return response('', 204)->header('Cache-Control', 'no-store');
        $versions = []; $serials = [];
        foreach ($rows as $pass) {
            $config = WalletConfig::withoutGlobalScopes()->where('organization_id', $pass->organization_id)->first();
            abort_unless($config, 503);
            try { $pass = app(Passes::class)->refresh($pass, $config); } catch (\Throwable) { abort(503); }
            $versions[] = $pass->id.':'.$pass->revision;
            $serials[] = $pass->serial;
        }
        // Opaque version of this device's registered set. No clock collisions or skipped concurrent commits.
        $tag = hash('sha256', implode('|', $versions));
        if (hash_equals($tag, (string) $request->query('passesUpdatedSince', ''))) return response('', 204)->header('Cache-Control', 'no-store');
        return response()->json(['lastUpdated' => $tag, 'serialNumbers' => $serials])->header('Cache-Control', 'no-store');
    }

    public function download(Request $request, string $type, string $serial)
    {
        $pass = $this->authenticated($request, $type, $serial);
        $config = WalletConfig::withoutGlobalScopes()->where('organization_id', $pass->organization_id)->first();
        abort_unless($config, 503);
        try {
            $passes = app(Passes::class);
            $pass = $passes->refresh($pass, $config);
            $binary = app(AppleWalletService::class)->generate($passes->member($pass), $config, $pass);
        } catch (\Throwable) { abort(503, 'Pass update temporarily unavailable.'); }
        // Always answer the current pass; second-resolution If-Modified-Since can miss rapid balance changes.
        return response($binary)->header('Content-Type', 'application/vnd.apple.pkpass')->header('Cache-Control', 'no-store')
            ->header('Last-Modified', $pass->updated_at->toRfc7231String());
    }

    public function logs(Request $request)
    {
        $request->validate(['logs' => 'required|array|max:20', 'logs.*' => 'string|max:2000']);
        // Device logs can contain personal information and credentials. Do not persist or echo them.
        return response('', 200)->header('Cache-Control', 'no-store');
    }
}
