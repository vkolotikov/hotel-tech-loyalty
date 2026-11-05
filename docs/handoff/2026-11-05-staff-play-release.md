# Staff Play update — 5 November 2026

## Current checkpoint: production update submitted

At **13:24 UTC / 15:24 Europe/Riga on 5 November 2026**, the owner's authenticated Playwright browser sent **four changes for review**: production **1.0.5 (version code 4)** with a full rollout, the English app icon, feature graphic and five phone screenshots. At **13:30 UTC**, automated quick checks had finished and Publishing overview confirmed **Your changes are now in review** with no blocking issue. This is **not approval or evidence that 1.0.5 is publicly available**; the last confirmed public release is 1.0.0 (3), published 3 November. Managed publishing remains off, so approval can publish the update automatically.

Existing code 4 was promoted from internal testing; no rebuild or duplicate AAB upload. The production notes match `store/play/release-1.0.5.json` exactly in all five languages. Release validation was **Ready to release**, with no lost supported devices, 100% rollout and **Available in all targeted countries**. A post-submission API check at 13:25 UTC verified the same **177 named countries plus Rest of world**, including exact equality of the country-code list before and after.

All seven saved English images match the prepared source SHA-256 hashes, including screenshot order **Home → Find → Member → Requests → More**. The first UI save retained old images on translated listings; those overrides were removed. The final API snapshot confirms no French, German, Russian or Spanish image overrides, so they inherit English, and all five titles/descriptions remain exact source matches. The composed feature graphic is labelled AI-assisted; the unchanged owner-supplied icon artwork and real Android screenshots are not. No new legal agreement was presented.

Desktop native/browser helpers still failed, and Chrome DevTools had a profile-in-use conflict. The Playwright browser worked after the owner completed Google sign-in there. Publication required no further approval. No service-account permission changes, Laravel deployment, member-app changes or iOS submission occurred.

Publishing overview: https://play.google.com/console/u/0/developers/7195613243489270668/app/4973001253686610054/publishing

At 13:29 UTC, [submission 3](https://play.google.com/console/u/0/developers/7195613243489270668/app/4973001253686610054/publishing/submission-activity/3/details) independently confirmed **In review**, source Play Console, submitted 15:24 Riga, with exactly the same four changes. The final 13:30 UTC Publishing overview check supersedes the earlier quick-check processing state.

Production release: https://play.google.com/console/u/0/developers/7195613243489270668/app/4973001253686610054/tracks/4697727084661029230/releases/2/review

Private credential-free verification reports are `staff-play-105-before-console.json` and `staff-play-105-resume-check.json` under `C:\Users\user6399\HexaTech-release-private`. Inspection edits were deleted without API commits. The API's production status `completed` means the requested full rollout, not Google review approval.

## Earlier build and access checkpoint (superseded for submission status)

Active owner instruction: use root `favicon.jpg` for the app icon, deploy a new Staff Android release to Google Play and update store screenshots. The owner also requests using their open desktop browser. All publication authorization is already present; credentials/legal agreements retain the original release boundaries. No iOS or backend deploy is requested.

Source `C:\wamp64\www\hexatech-apps`, branch `feature/staff-play-release-20261105`, runtime `d8cec9e70`; assets `115633bd7`, clean search capture/checkpoint `ced43b2e9`. Mirror `C:\wamp64\www\hexatech-staff-release-20261102`, local branch `feature/loyalty-staff-release-20261102`, runtime `80e68de39`, assets `cc8d1381e`, checkpoint `6bb03d732`, pushed to `feature/loyalty-staff-app`. Never merge this native branch to Laravel main.

Production build **1.0.5 (4)** completed: EAS id `deda8509-5b6c-4bc5-8577-875cb36317e8`, 10:22:10 UTC. Submission `c9b74e65-d3d6-4665-acb7-f69d68de4519` succeeded to **internal testing**, independently verified through Play API. AAB `C:\Users\user6399\Downloads\HexaTech-Staff-1.0.5-4.aab`, SHA-256 `BFAEC07BFA9F4FBCAE58FA5C29948A683CA00A4033F2078F17D96E6DAC8E01F8`. Actual bundle package/version/code, Firebase resources and launcher foreground checked; camera/NFC present, microphone/Advertising ID absent. Private status/build/worker logs: `C:\Users\user6399\HexaTech-release-private\staff-design\play-105-*`; never echo signed log URLs. Exact source JPEG, new app/adaptive/web/Play icon exports and five fresh Android screenshots ready. Full details: `docs/loyalty-staff-app/18-PLAY-RELEASE-20261105.md`.

45 tests, TypeScript, installed ESLint and Expo dependency check pass. Screenshots are real native 1080×2160 captures from layout-equivalent 1.0.4 using the isolated demo. No points/requests/cards were mutated. Emulator size/demo mode/transition animation restored. Physical QR recognition/NFC still require a real phone as recorded before.

Play production remains **1.0.0 (3)**; internal testing is now **1.0.5 (4)**. Attempted asset edits passed upload hash/count checks but standalone validation and a normal final commit returned 403; uncommitted edits were removed: no Play images have changed. `changesNotSentForReview=true` also returned 400 (Google requires automatic review for these metadata changes). Testing service-account permissions were not expanded. Final production promotion/listing change needs the owner's authenticated console. Use `store/play/release-1.0.5.json` for five-language notes; replace icon, feature graphic and all five English phone screenshots from source, then send production and listing changes for review. Publishing is already authorized.

Desktop/browser tool blocker: `browser access host is unavailable`; native `Computer Use native pipe is unavailable ... (os error 2)`. CUA and Computer Use node/sky retries/resets failed. Separate Chrome DevTools browser page 3 is on Google sign-in, despite owner reporting they signed in; their normal Chrome is a different profile. Owner says use desktop; desktop helper has no connection. Asked owner to restart the desktop chat application and return. Do not access browser credentials or expand permissions as a workaround. Finish build/AAB/upload work independently, then resume UI once desktop connection works.
