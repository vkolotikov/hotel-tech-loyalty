<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\AiHelperRefused;
use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Services\Crm\BusinessProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class BusinessProfileController extends Controller
{
    public function __construct(private readonly BusinessProfile $profiles) {}

    public function guest(Request $request, Guest $guest): Response
    {
        return $this->handle($request, $guest);
    }

    public function inquiry(Request $request, Inquiry $inquiry): Response
    {
        return $this->handle(
            $request,
            Guest::findOrFail($inquiry->guest_id),
            $inquiry->corporateAccount?->company_name,
        );
    }

    private function handle(Request $request, Guest $guest, ?string $company = null): JsonResponse
    {
        if ($request->isMethod('PUT')) {
            $input = $request->validate([
                'revision' => 'required|integer|min:0',
                'discovery_id' => 'nullable|uuid',
                ...BusinessProfile::validationRules(),
            ]);
            $input['revision'] = (int) $input['revision'];
            $this->profiles->save($guest, $input);
        }
        if ($request->isMethod('POST')) {
            $input = $request->validate([
                'company_name' => 'nullable|string|max:200',
                'website_url' => BusinessProfile::validationRules()['fields.website_url'],
                'language' => 'required|in:en,de,fr,es,ru',
            ]);
            $current = $this->profiles->data($guest, $company);
            $identity = [
                'company_name' => $input['company_name'] ?? $current['fields']->company_name ?? $current['suggested_company'],
                'website_url' => $input['website_url'] ?? $current['fields']->website_url ?? null,
                'language' => $input['language'],
            ];
            if (! $identity['company_name'] && ! $identity['website_url']) {
                throw new AiHelperRefused('company_required', 'Enter the company name or its official website.', 422);
            }
            $this->profiles->start($guest, $identity, (int) $request->user()->id);
        }

        return response()->json($this->profiles->data($guest, $company), $request->isMethod('POST') ? 202 : 200)
            ->header('Cache-Control', 'private, no-store');
    }
}
