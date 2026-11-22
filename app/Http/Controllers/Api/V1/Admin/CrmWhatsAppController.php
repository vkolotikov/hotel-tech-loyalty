<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Services\Integrations\CrmMail;
use App\Services\Integrations\CrmWhatsApp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CrmWhatsAppController extends Controller
{
    public function __construct(private readonly CrmMail $contacts, private readonly CrmWhatsApp $whatsapp) {}

    public function status(Request $request): JsonResponse
    {
        return $this->json($this->contacts->available($request->user()) ? $this->whatsapp->status() : ['available' => false]);
    }

    public function guest(Request $request, Guest $guest): JsonResponse
    {
        return $this->json($this->contacts->available($request->user()) && $this->contacts->owns($guest)
            ? $this->whatsapp->messages($guest, $this->page($request)) : ['available' => false]);
    }

    public function inquiry(Request $request, Inquiry $inquiry): JsonResponse
    {
        if (! $inquiry->guest_id || (int) $inquiry->brand_id !== CrmMail::BRAND || ! $this->contacts->available($request->user())) {
            return $this->json(['available' => false]);
        }

        return $this->json($this->whatsapp->messages(Guest::findOrFail($inquiry->guest_id), $this->page($request)));
    }

    private function page(Request $request): int
    {
        return (int) ($request->validate(['page' => 'sometimes|integer|min:1|max:10000'])['page'] ?? 1);
    }

    private function json(array $data): JsonResponse
    {
        return response()->json($data)->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff');
    }
}
