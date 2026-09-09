# Hexa-Tech plugin

Find customers, review bookings, and add customer or booking notes through your connected Hexa-Tech account.

This package uses the supported plugin-creator layout:

```text
hexatech/
  .codex-plugin/plugin.json
  .mcp.json
  skills/customer-bookings/SKILL.md
```

The MCP connection points to `https://app.hexa-tech.uk/mcp` and uses OAuth. The server must be deployed, enabled, and configured for account linking before the live connection works. Direct Codex installation also requires the actual public OAuth client and callback settings in `.mcp.json`; alternatively, package the registered ChatGPT connection through `.app.json` after registration. No secrets or invented client or connection IDs are included in this package.

| Tool | Purpose |
| --- | --- |
| `search_customers` | Find customers matching a search. |
| `get_customer` | Read one customer's details. |
| `list_bookings` | Find reservations, room bookings, or service bookings. |
| `get_booking` | Read one booking using its kind and ID. |
| `add_customer_note` | Add the customer note explicitly requested by the user. |
| `add_booking_note` | Add the booking note explicitly requested by the user. |

Example requests:

- “Find a customer named Morgan Lee.”
- “Show room bookings for 10 September 2026.”
- “Show the details of this reservation.”
- “Add this note to the booking: Guest requested a quiet room.”

The server enforces account permissions. This plugin does not create or cancel bookings, take payments, or send messages.

Access requires an active staff account in an enabled workspace and a verified active subscription or unexpired trial. During a pilot, only explicitly approved organizations can connect. A connection's display name does not restrict it to a brand; the server applies the signed-in account's actual workspace and brand permissions.

You can withdraw approval from **Connected apps** in the Hexa-Tech sidebar or at `/account/connections`. **Disconnect ChatGPT and Codex** revokes your current-workspace access and its refresh credentials. The page remains available if your subscription expires or the pilot is disabled. Logging out of Hexa-Tech alone does not disconnect the plugin, and disconnecting does not delete information already shared in chats.

Search and booking results are paginated. The assistant must follow the returned continuation fields and disclose truncated results. Amounts with an unknown currency must stay unknown; separate booking collections may overlap and must not be added together as unique bookings. Existing notes remain visible in the service-booking portal when new notes are appended.

See [the repository setup guide](../../docs/chatgpt-plugin.md) for deployment, OAuth configuration, testing, and registration. A plugin package is not automatically a published or installed ChatGPT plugin; this change does not create a marketplace or register a live connection.

Production configuration and live account linking remain pending until separately verified. The generic package contains no production customer IDs, billing-principal IDs, credentials or invented OAuth identifiers.
