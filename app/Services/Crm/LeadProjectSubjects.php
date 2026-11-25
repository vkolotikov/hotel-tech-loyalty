<?php

namespace App\Services\Crm;

use App\Services\Integrations\CrmMail;
use Illuminate\Support\Facades\DB;

final class LeadProjectSubjects
{
    /** Each opportunity's exclusive subjects, including sibling opportunities across brands when checking ambiguity. */
    public static function forGuests(int $organization, array $guests): array
    {
        $projects = DB::table('inquiries')->where('organization_id', $organization)->whereIn('guest_id', $guests)
            ->get(['id', 'guest_id', 'brand_id'])->keyBy('id');
        $result = [];
        foreach ($projects as $project) {
            $result[$project->guest_id][$project->id] = [];
        }

        $shared = array_filter($result, fn (array $leads): bool => count($leads) > 1);
        if (! $shared) {
            return $result;
        }
        $ids = $projects->whereIn('guest_id', array_keys($shared))->keys();
        $rows = DB::table('activities')->where('organization_id', $organization)->where('type', 'email')
            ->whereIn('inquiry_id', $ids)->whereNotNull('subject')->distinct()->get(['inquiry_id', 'brand_id', 'subject']);
        $owners = [];
        foreach ($rows as $row) {
            $lead = $projects[$row->inquiry_id];
            $subject = CrmMail::threadSubject(['subject' => $row->subject]);
            if ($subject === '') {
                continue;
            }
            $valid = $row->brand_id === null || (int) $row->brand_id === (int) $lead->brand_id;
            $owners[$lead->guest_id][$subject][$valid ? $lead->id : 0] = true;
        }
        foreach ($owners as $guest => $subjects) {
            foreach ($subjects as $subject => $leads) {
                $id = array_key_first($leads);
                if ($id && count($leads) === 1) {
                    $result[$guest][$id][$subject] = true;
                }
            }
        }

        return $result;
    }
}
