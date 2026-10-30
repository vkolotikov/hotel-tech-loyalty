# Windows ACR122U helper (preview)

Portable Windows/.NET Framework helper. No installation, account credentials, browser extension, local server,
card writes or keyboard injection. It reads the public UID through Windows PC/SC, displays it, and copies it only
when the operator presses **Copy UID**. Paste into the existing Scan a member or Link card field. Reads are manual;
continuous door scanning still uses the existing camera/HID transport.

Build with `powershell -File tools/reader/build.ps1` on Windows. The build runs protocol self-tests and prints the
binary SHA-256. `hexatech-reader-preview.exe --probe` reports reader count without reading a card. The source is
included here; the downloadable binary is unsigned. Do not bypass an organisation's software policy or Windows
security controls to run it. A signed distribution can follow physical acceptance.

The self-tests cover successful 4/7/8/10-byte UID replies, status-word rejection and truncated/invalid replies.
They do not replace an actual ACR122U/card test. Acceptance: refresh readers, read the same card twice, copy and
look up/link it in the correct organisation, try an unknown/deactivated card, unplug/reconnect, and confirm the
failure message after removing a card. No identifier is saved in a file or sent to a server by this helper.

Protocol sources: [Microsoft PC/SC functions](https://learn.microsoft.com/en-us/windows/win32/secauthn/smart-card-and-reader-access-functions)
and [ACS ACR122U API](https://www.acs.com.hk/cn/download-manual/933/API-ACR122U-CN-2.04.pdf).
