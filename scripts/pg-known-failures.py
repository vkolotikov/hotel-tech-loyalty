#!/usr/bin/env python3
"""Compares a PostgreSQL run's failures with the tests that fail there on purpose.

usage: scripts/pg-known-failures.py <junit directory> <known failures file> [--write]

The JUnit reports come from `JUNIT_DIR=<dir> scripts/test-pg.sh ...`. The known-failures file holds one
`Class::method` per line (comments start with #); docs/loyalty-workspace.md "Tests on PostgreSQL" says why each
group fails. Exit status 1 when a test fails that is not on the list, or when no report was found (a run that never
started must not look green). A listed test that now passes is reported, so the list can shrink. --write replaces
the list with this run's failures (for after an intended change), keeping the file's leading comment block.
"""
import pathlib
import sys
import xml.etree.ElementTree as ET


MESSAGES: dict[str, str] = {}
UNREADABLE: list[str] = []


def failures(junit_dir: pathlib.Path) -> tuple[set[str], int]:
    failed, total = set(), 0
    for report in sorted(junit_dir.glob('*.xml')):
        try:
            cases = list(ET.parse(report).iter('testcase'))
        except ET.ParseError:
            UNREADABLE.append(report.name)  # a run that was killed part-way leaves a truncated report
            continue
        for case in cases:
            total += 1
            problem = case.find('failure') if case.find('failure') is not None else case.find('error')
            if problem is not None:
                cls = (case.get('class') or case.get('classname') or '').replace('.', '\\')
                name = f"{cls}::{case.get('name')}"
                failed.add(name)
                MESSAGES[name] = (problem.text or problem.get('message') or '').strip()
    return failed, total


def known(path: pathlib.Path) -> set[str]:
    if not path.exists():
        return set()
    return {line.strip() for line in path.read_text().splitlines() if line.strip() and not line.startswith('#')}


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    junit_dir, known_file = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    failed, total = failures(junit_dir)
    if total == 0:
        print(f'No JUnit test cases under {junit_dir}: the PostgreSQL run did not happen.')
        return 1
    if '--write' in sys.argv:
        header = [l for l in (known_file.read_text().splitlines() if known_file.exists() else []) if l.startswith('#')]
        known_file.write_text('\n'.join(header + sorted(failed)) + '\n')
        print(f'Wrote {len(failed)} known failures to {known_file}.')
        return 0
    expected = known(known_file)
    new, fixed = sorted(failed - expected), sorted(expected - failed)
    print(f'{total} tests ran on PostgreSQL; {len(failed)} failed; {len(expected)} are known to fail there.')
    for name in fixed:
        print(f'::notice::Now passes on PostgreSQL (remove it from {known_file}): {name}')
    for name in new:
        print(f'::error::New failure on PostgreSQL: {name}')
        for line in MESSAGES.get(name, '').splitlines()[:12]:
            print(f'    {line}')
    for name in UNREADABLE:
        print(f'::error::Unreadable JUnit report (the run stopped part-way?): {name}')
    return 1 if new or UNREADABLE else 0


if __name__ == '__main__':
    sys.exit(main())
