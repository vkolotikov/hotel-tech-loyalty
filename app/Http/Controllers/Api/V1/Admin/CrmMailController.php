<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Services\Integrations\CrmMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CrmMailController extends Controller
{
    public function guest(Request $request, Guest $guest, CrmMail $mail): JsonResponse
    {
        if (! $mail->available($request->user())) {
            return $this->json(['available' => false]);
        }

        return $this->json($mail->read($guest, $this->input($request)));
    }

    public function inquiry(Request $request, Inquiry $inquiry, CrmMail $mail): JsonResponse
    {
        if (! $mail->available($request->user()) || (int) $inquiry->brand_id !== CrmMail::BRAND) {
            return $this->json(['available' => false]);
        }
        $guest = Guest::findOrFail($inquiry->guest_id);

        return $this->json($mail->read($guest, $this->input($request)));
    }

    private function input(Request $request): array
    {
        $data = $request->validate(['page' => 'sometimes|integer|min:1|max:10000', 'cursor' => 'nullable|string|max:4096', 'message_id' => 'sometimes|uuid']);

        return [...$data, 'action' => $request->isMethod('POST') ? 'refresh' : (isset($data['message_id']) ? 'content' : 'list')];
    }

    private function json(array $data): JsonResponse
    {
        return response()->json($data)->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff');
    }
}
