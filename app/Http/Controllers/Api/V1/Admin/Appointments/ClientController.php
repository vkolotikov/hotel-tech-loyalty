<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\ClientDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request, ClientDirectory $clients): JsonResponse
    {
        $data = $request->validate(['search' => 'required|string|min:2|max:100']);

        return response()->json(['clients' => $clients->search($data['search'])]);
    }

    public function store(Request $request, ClientDirectory $clients): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:200',
            'phone'       => 'nullable|required_without:email|string|max:50',
            'email'       => 'nullable|required_without:phone|email|max:150',
            'confirm_new' => 'nullable|boolean',
        ]);

        $matches = $clients->possibleDuplicates($data['email'] ?? null, $data['phone'] ?? null);
        if ($matches !== [] && !($data['confirm_new'] ?? false)) {
            throw new AppointmentRefused(
                'possible_duplicate',
                'A client with this phone number or email already exists.',
                409,
                ['matches' => $matches],
            );
        }

        $guest = $clients->create($data['name'], $data['phone'] ?? null, $data['email'] ?? null);

        return response()->json(['client' => $clients->summary($guest)], 201);
    }

    public function show(int $id, ClientDirectory $clients): JsonResponse
    {
        $guest = Guest::find($id) ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);

        return response()->json($clients->profile($guest));
    }
}
