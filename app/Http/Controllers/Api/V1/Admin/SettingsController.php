<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingsController extends Controller
{
    public function index(): JsonResponse
    {
        $settings = HotelSetting::all()->groupBy('group')->map(function ($group) {
            return $group->map(function ($setting) {
                return [
                    'id' => $setting->id,
                    'key' => $setting->key,
                    'value' => $setting->typed_value,
                    'type' => $setting->type,
                    'label' => $setting->label,
                    'description' => $setting->description,
                ];
            });
        });

        return response()->json(['settings' => $settings]);
    }

    /**
     * Public endpoint — returns appearance/theme settings only (no auth required).
     */
    public function theme(): JsonResponse
    {
        $settings = HotelSetting::where('group', 'appearance')
            ->pluck('value', 'key');

        return response()->json(['theme' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings' => 'required|array',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'present',
        ]);

        foreach ($validated['settings'] as $item) {
            HotelSetting::setValue($item['key'], $item['value']);
        }

        return response()->json(['message' => 'Settings updated']);
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => 'required|image|mimes:jpeg,png,jpg,webp,svg|max:4096',
        ]);

        $path = $request->file('logo')->store('logos', 'public');
        $url  = '/storage/' . $path;

        // Upsert the company_logo setting
        $setting = HotelSetting::where('key', 'company_logo')->first();
        if ($setting) {
            // Delete old file if it exists
            $oldPath = str_replace('/storage/', '', $setting->value ?? '');
            if ($oldPath && Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }
            $setting->update(['value' => $url]);
        } else {
            HotelSetting::create([
                'key'         => 'company_logo',
                'value'       => $url,
                'type'        => 'string',
                'group'       => 'appearance',
                'label'       => 'Company Logo',
                'description' => 'Logo displayed in the app header and member cards',
            ]);
        }

        return response()->json(['message' => 'Logo uploaded', 'url' => $url]);
    }
}
