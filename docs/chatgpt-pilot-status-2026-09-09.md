# Hexa-Tech / FDS Cards pilot status — 9 September 2026

**The pilot is connected and live read-only checks passed.** ChatGPT linked the approved Hexa-Tech account, discovered all six tools, and successfully searched customers and all three booking types. The Codex package is installed locally; start a new Codex thread to load it.

## Delivery state

| Component | Observed state |
| --- | --- |
| Production integration | Deployment `depl-a2b4ba7f-25c6-4b56-ac88-3d3054cc3156` succeeded at commit `32b215e2db075ea90cf7cdbf246d3ae9b9796f0d`, through the isolated source-patch process. |
| ChatGPT app registration | Complete. [Registered connection](https://chatgpt.com/plugins/plugin_asdk_app_6aa185b994bc8191bdfbf7c3c32e44b1); app ID `asdk_app_6aa185b994bc8191bdfbf7c3c32e44b1`. |
| Local Codex package | `hexatech@personal`, version `0.1.1`, installed and enabled. Source: `C:/Users/user6399/plugins/hexatech`; default personal marketplace: `~/.agents/plugins/marketplace.json`. |
| Repository package | `plugins/hexatech` and the generated root `hexatech-plugin.zip`. The registered app supplies the connection; no duplicate direct `.mcp.json` is bundled. |
| Live OAuth grant and tool checks | OAuth approval and token exchange succeeded. All six tools were discovered. Four bounded read checks returned success with zero matching records. The portal displays the active grant and disconnect control. |

The pilot account is **vitaly@fds-cards.co.uk**, in the **Kolotikovs** workspace. Access covers all brands that account is permitted to use, including Hexa-Tech where permitted. There is no additional FDS Cards-only brand filter. Existing staff permissions, tenant boundaries, pilot eligibility and subscription verification still apply.

## Connect and use

1. Start a new ChatGPT/Codex conversation so the installed package is loaded. In ChatGPT, open the registered connection above and choose **Try in chat**; in Codex, select **Hexa-Tech** using the same ChatGPT account.
2. Follow **Connect** when offered, sign in to the eligible Hexa-Tech staff account, review the requested access and approve it in the Hexa-Tech consent page. A local package installation alone does not replace this approval.
3. Start with a read, such as “Show my upcoming bookings.” The assistant can find customers and list or retrieve CRM reservations, room bookings and service appointments.
4. To add a note, identify the intended customer or booking and explicitly provide the note. The assistant must confirm the target before writing and report success only after the server confirms it. Booking creation, cancellation, payments and messaging are outside this integration.

The live smoke test used the literal query `HEXATECH-SMOKE-20260909-9b2e`, limit 1, and a single day for each booking kind. All four returned zero records successfully; the corresponding live MCP requests returned HTTP 200. [Test conversation](https://chatgpt.com/c/6aa18953-7d74-83ed-b164-871ce10d9375). This verifies the connected read paths and empty results, not every existing record's data shape. No customer data or notes were changed. Record detail, note writes, isolation, token refresh and revocation were covered by automated tests; live note writes and disconnect/reconnect were not exercised.

## Disconnect

Open [Connected apps](https://app.hexa-tech.uk/account/connections), or use **Connected apps** in the Hexa-Tech sidebar. Choose **Disconnect ChatGPT and Codex**, then **Disconnect all**. This withdraws the current staff member's grants for the current workspace, including refresh access and pending authorization codes.

The page remains available when the subscription expires or the pilot is disabled. An already-running request may finish; subsequent requests and refreshes must be denied. Logging out or disabling the local package alone does not revoke OAuth approval. Disconnecting does not remove information already shared in chats. Live revocation verification should confirm both the old access and refresh credentials are refused, then reconnect if the pilot should remain usable.

## Other staff and customers

The personal marketplace installation applies to this local setup. It does not automatically install the plugin for colleagues or publish it in the public directory. Other staff need access to the registered app in their own ChatGPT account/workspace, an eligible Hexa-Tech staff account and their own OAuth approval.

Additional customer organizations need explicit pilot/rollout eligibility and valid subscription checks. A package ZIP, display name or shared app link grants no Hexa-Tech data access. The current integration serves authorized business staff; it is not a customer/member self-service portal connection. Wider workspace sharing or public publication is a separate distribution step, and this report does not claim either is complete.

## Verification and remaining work

| Check | Result |
| --- | --- |
| Initial isolated release artifact | 196 backend tests passed, 957 assertions. |
| OAuth/transport suites after the consent-header fix | 27 tests passed, 269 assertions. These overlap the broader checks; do not add the counts together. |
| Frontend TypeScript | Passed. |
| Full frontend Vitest | 799 passed; the 3 documented pre-existing `plannerMeta` failures remain. |
| Package/skill validation | Passed. The ZIP contains all 4 package files, including hidden manifests; archive contents matched source bytes. |
| Live approval and discovery | Passed: consent POST redirected successfully, token exchange returned 200, ChatGPT showed connected status and all six tools. |
| Live customer and booking searches | Passed: customer search plus room, reservation and service booking searches; bounded empty-result cases. |
| Live note write and disconnect/reconnect | Not performed. Automated note, CSRF, tenant isolation, refresh and revocation tests passed. The live portal displays the approved grant and disconnect control. |

The earlier production screenshot errors are documented separately in [the log triage](chatgpt-log-triage-2026-09-09.md). They trace to existing login handling, brand-lock integer overflow and malformed CRM IDs. Their initiating client/session is not fully established, and those application issues have not been fixed as part of the plugin work.

Live testing exposed two integration-specific browser/protocol issues: ChatGPT's initial bodyless MCP probe needed an OAuth challenge, and the consent page's `no-referrer` header caused HTML form submission to send a null origin. Both were corrected and regression-tested before the successful connection. The consent page now uses `same-origin`; null origins remain forbidden, and other OAuth responses retain `no-referrer`. These were separate from the screenshot errors.

See [the integration guide](chatgpt-plugin.md) for setup, security boundaries and the deployment recipe. Wider customer distribution remains a separate rollout step.
