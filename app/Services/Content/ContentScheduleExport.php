<?php

namespace App\Services\Content;

use App\Services\Appointments\VenueClock;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class ContentScheduleExport
{
    public const MAX = 5000;

    public const COLUMNS = ['id', 'platform', 'status', 'scheduled_date', 'scheduled_time', 'campaign_id', 'language', 'topic', 'hook', 'main_copy', 'cta', 'hashtags'];

    public static function download(Builder $query, string $format): StreamedResponse
    {
        if ($format === 'ics') {
            $query->whereNotNull('scheduled_date');
        }
        // Only small scalar IDs in memory; membership is fixed even if matching posts arrive during the download.
        $ids = (clone $query)->limit(self::MAX + 1)->pluck('id')->all();
        if (count($ids) > self::MAX) {
            throw new ContentRefused('export_too_many', 'More than 5,000 posts match. Refine the filters and export again.', 422);
        }
        if ($ids === []) {
            throw new ContentRefused('export_empty', 'No exportable posts match these filters.', 422);
        }
        $zone = VenueClock::zone(ContentContext::orgId());
        $org = ContentContext::orgId();
        $brand = ContentContext::brandId();
        // Spool on disk before sending headers: bounded memory and clean errors, never a silent truncated file.
        $stream = tmpfile();
        if ($stream === false) {
            throw new ContentRefused('export_failed', 'The export could not be prepared. Please try again.', 503);
        }
        $write = static function (string $bytes) use ($stream): void {
            if (fwrite($stream, $bytes) !== strlen($bytes)) {
                throw new ContentRefused('export_failed', 'The export could not be prepared. Please try again.', 503);
            }
        };
        try {
            $write($format === 'csv' ? "\xEF\xBB\xBF".self::csv(self::COLUMNS) : "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HexaTech//Content Schedule//EN\r\nCALSCALE:GREGORIAN\r\n");
            $count = 0;
            foreach (array_chunk($ids, 50) as $chunk) {
                // Reapply authorization and deliberate filters; never include a row moved to another brand meanwhile.
                foreach ((clone $query)->whereIn('id', $chunk)->toBase()->get(self::COLUMNS) as $row) {
                    $count++;
                    $values = (array) $row;
                    $values['scheduled_date'] = $row->scheduled_date ? substr($row->scheduled_date, 0, 10) : '';
                    $values['scheduled_time'] = $row->scheduled_time ? substr($row->scheduled_time, 0, 5) : '';
                    if ($format === 'csv') {
                        $write(self::csv(array_values($values)));

                        continue;
                    }
                    $lines = ['BEGIN:VEVENT', "UID:content-$org-$brand-{$row->id}@hexa-tech", 'DTSTAMP:'.gmdate('Ymd\THis\Z')];
                    $lines[] = $row->scheduled_time
                        ? 'DTSTART:'.self::instant($values['scheduled_date'].' '.$values['scheduled_time'], $zone)
                        : 'DTSTART;VALUE=DATE:'.str_replace('-', '', $values['scheduled_date']);
                    $lines[] = 'SUMMARY:'.self::text($row->topic ?: $row->hook ?: $row->platform);
                    $lines[] = 'DESCRIPTION:'.self::text(implode("\n\n", array_filter([$row->hook, $row->main_copy, $row->cta, $row->platform.' · '.$row->status])));
                    $lines[] = 'END:VEVENT';
                    foreach ($lines as $line) {
                        $write(self::fold($line));
                    }
                }
            }
            if ($count === 0) {
                throw new ContentRefused('export_empty', 'No exportable posts match these filters.', 422);
            }
            if ($format === 'ics') {
                $write("END:VCALENDAR\r\n");
            }
            rewind($stream);
        } catch (\Throwable $e) {
            fclose($stream);
            throw $e;
        }

        return response()->streamDownload(static function () use ($stream) {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, "content-schedule.$format", [
            'Content-Type' => $format === 'csv' ? 'text/csv; charset=UTF-8' : 'text/calendar; charset=UTF-8',
            'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** OWASP human spreadsheet export: risky prefixes retain a tab on programmatic import. */
    public static function csv(array $cells): string
    {
        return implode(',', array_map(static function ($cell) {
            $s = (string) $cell;
            if (preg_match('/^[\p{Z}\p{C}\s]*[=+\-@＝＋－＠]/u', $s) || preg_match('/^[\p{Z}\p{C}\s]*[\t\r\n]/u', $s)) {
                $s = "\t".$s;
            }

            return '"'.str_replace('"', '""', $s).'"';
        }, $cells))."\r\n";
    }

    public static function text(string $value): string
    {
        $value = str_replace(["\r\n", "\r"], "\n", $value);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);

        return str_replace(['\\', ';', ',', "\n"], ['\\\\', '\\;', '\\,', '\\n'], $value);
    }

    public static function fold(string $line): string
    {
        $out = '';
        $width = 75;
        while (strlen($line) > $width) {
            $part = mb_strcut($line, 0, $width, 'UTF-8');
            $out .= $part."\r\n ";
            $line = substr($line, strlen($part));
            $width = 74;
        }

        return $out.$line."\r\n";
    }

    /** RFC 5545 3.3.5: first repeated wall time; pre-gap offset for nonexistent times. */
    public static function instant(string $wall, string $zone): string
    {
        $tz = new DateTimeZone($zone);
        $stamp = (new DateTimeImmutable($wall, new DateTimeZone('UTC')))->getTimestamp();
        $transitions = $tz->getTransitions($stamp - 172800, $stamp + 172800) ?: [];
        $matches = [];
        foreach (array_unique(array_column($transitions, 'offset')) as $offset) {
            $candidate = $stamp - $offset;
            if ((new DateTimeImmutable('@'.$candidate))->setTimezone($tz)->format('Y-m-d H:i') === $wall) {
                $matches[] = $candidate;
            }
        }
        if ($matches !== []) {
            return gmdate('Ymd\THis\Z', min($matches));
        }
        foreach ($transitions as $i => $transition) {
            if ($i > 0 && $transition['offset'] > $transitions[$i - 1]['offset'] && $stamp >= $transition['ts'] + $transitions[$i - 1]['offset'] && $stamp < $transition['ts'] + $transition['offset']) {
                return gmdate('Ymd\THis\Z', $stamp - $transitions[$i - 1]['offset']);
            }
        }

        return (new DateTimeImmutable($wall, $tz))->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z');
    }
}
