<?php

namespace App\Services\Content\Web;

/** The addresses a host name resolves to (spec 2026-10-20 §3.5). Not final: tests put their own in the container. */
class HostResolver
{
    /** @return list<string> its IPv4 and IPv6 addresses; [] when it resolves to none */
    public function resolve(string $host): array
    {
        $ips = [];
        foreach ([DNS_A => 'ip', DNS_AAAA => 'ipv6'] as $type => $key) {
            foreach (@dns_get_record($host, $type) ?: [] as $record) {
                if (isset($record[$key]) && is_string($record[$key])) {
                    $ips[] = $record[$key];
                }
            }
        }
        if ($ips === []) {
            $ips = @gethostbynamel($host) ?: [];
        }

        return array_values(array_unique($ips));
    }
}
