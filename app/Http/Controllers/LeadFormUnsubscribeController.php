<?php

namespace App\Http\Controllers;

use App\Services\LeadForms\AutoReply;
use Illuminate\Http\Request;

final class LeadFormUnsubscribeController extends Controller
{
    public function __invoke(Request $request, string $token, AutoReply $replies)
    {
        $found = $replies->unsubscribe($token);
        if ($request->isMethod('post')) return response()->noContent();
        return response()->view('lead-forms.unsubscribed', ['found' => $found], $found ? 200 : 404);
    }
}
