# Hexa-Tech plugin

Find customers, review bookings, and add customer or booking notes through your connected Hexa-Tech account. Version 0.1.1 packages the registered Hexa-Tech app for the FDS Cards pilot.

This package uses the supported plugin-creator layout:

```text
hexatech/
  .codex-plugin/plugin.json
  .app.json
  README.md
  skills/customer-bookings/SKILL.md
```

The `.app.json` mapping uses the actual registered app ID `asdk_app_6aa185b994bc8191bdfbf7c3c32e44b1`. The corresponding [ChatGPT connection details](https://chatgpt.com/plugins/plugin_asdk_app_6aa185b994bc8191bdfbf7c3c32e44b1) use the `plugin_` prefix in the management URL. Access to that page depends on your ChatGPT account and workspace.

The registered app connects to `https://app.hexa-tech.uk/mcp` through OAuth. Use the host's account-linking flow, sign in to your own eligible Hexa-Tech staff account, and approve access. The package contains no OAuth credentials and does not grant access by itself. It deliberately has no `.mcp.json`: the registered app supplies this connection, so installing the package does not add a second direct MCP connection to the same server.

The mapping follows the supported [OpenAI plugin packaging layout](https://developers.openai.com/plugins/build/plugins) and the raw app-ID format in OpenAI's [Notion app manifest](https://github.com/openai/plugins/blob/main/plugins/notion/.app.json).

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

Access requires an active staff account in an enabled workspace and a verified active subscription or unexpired trial. During the pilot, only explicitly approved organizations can connect. The FDS Cards pilot covers all brands the signed-in account is permitted to access in its workspace, including Hexa-Tech where permitted. It is not restricted to records labelled FDS Cards. The server continues to enforce the account's actual workspace and brand permissions; names and package installation do not expand them.

You can withdraw approval from **Connected apps** in the Hexa-Tech sidebar or at `/account/connections`. **Disconnect ChatGPT and Codex** revokes your current-workspace access and its refresh credentials. The page remains available if your subscription expires or the pilot is disabled. Logging out of Hexa-Tech alone does not disconnect the plugin, and disconnecting does not delete information already shared in chats.

Search and booking results are paginated. The assistant must follow the returned continuation fields and disclose truncated results. Amounts with an unknown currency must stay unknown; separate booking collections may overlap and must not be added together as unique bookings. Existing notes remain visible in the service-booking portal when new notes are appended.

See [the repository setup guide](../../docs/chatgpt-plugin.md) for deployment, OAuth configuration, testing, and registration. Registration of the referenced app succeeded on 9 September 2026. Public directory publication, availability to other ChatGPT accounts, local marketplace installation, and live customer/tool checks are separate steps; this package does not claim they are complete.

This package contains the registered app's public technical identifier, but no production customer IDs, billing-principal IDs or credentials. Each customer must have access to the registered app in their ChatGPT workspace and approve their own eligible Hexa-Tech account connection.
