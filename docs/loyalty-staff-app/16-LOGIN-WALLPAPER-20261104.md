# Staff login and blue/gold wallpaper — 4 November 2026

The owner supplied a login reference, a new blue/gold wave wallpaper and a gold HEXATECH logo. The requested lockup belongs only on login; the signed-in screens should have no logo or redundant staff/brand copy.

## Implementation

- Login has the centered lockup, a short welcome, independent glass email/password controls with icons, a password visibility button, right-aligned password recovery and a gold capsule sign-in button. The existing travelling border light is used on both fields and the button; their faces and the wallpaper remain still. Reduced-motion and solid-background preferences continue to apply.
- One compact language control opens the existing accessible sheet. All five languages remain available, including before authentication. Enter/Next moves from email to password; Go submits. Form controls are disabled while authentication is pending, and the existing server error handling remains in place.
- Staff accounts are provisioned by the venue. The reference's Create account button was therefore not copied into this staff sign-in flow. Password recovery keeps the existing web route.
- The new wallpaper is bundled once and used by the shared atmosphere component, including Home, desk screens and sheets. No background video, additional animation timer or dependency was introduced.
- Home now has the venue name and account control, followed by Scan and the four actions. The emblem and separate welcome block were removed. Sign-out confirmation and app-lock copy also omit the product name in all five languages. Launcher and native splash assets retain their previous configuration.
- Native version is **1.0.2**. Runtime source commit `d02dee77f`; native mirror commit `0bb95ac93`. These are native-only changes, not a Laravel Cloud deployment.

## Assets and provenance

The wallpaper is an unchanged copy of the supplied `Neon Glass Waves in Midnight Blue.png`, 854 × 1842, saved at `apps/loyalty-staff/assets/eclipse/wallpaper-blue-gold.png` (1,511,304 bytes).

The supplied `Luxurious Gold Hexatech Logo.png` was prepared with the built-in image-generation editing tool as a transparent lockup. The selected RGBA output is 1536 × 1024 and saved at `apps/loyalty-staff/assets/login-logo.png` (1,403,430 bytes). Layout contains the image without a destructive crop. The original input and generated output are retained outside the repository.

Final built-in edit prompt:

> Use case: background-extraction. Edit target: attached Hexatech gold brand artwork. Create a clean transparent PNG cutout of THIS EXACT complete logo for a mobile sign-in screen: the beveled gold hexagon with the thin gold H centered inside, and the original gold HEXATECH wordmark beneath. Preserve the emblem silhouette, H design, exact letterforms, spelling, proportions and gold metallic highlights. Remove the black background entirely and remove the broad smoky gold haze that currently obscures the logo, including in the negative spaces; retain only a very restrained soft edge glow so it looks clean over a dark navy photo. Do not redesign, add taglines, change text, add extra symbols, or add a backdrop. Transparent background throughout all negative space. Center the full emblem-plus-wordmark lockup and trim excess empty outer margins to approximately 5%, with the wordmark fully visible. Output only the isolated logo.

## Verification

- TypeScript and changed-file ESLint pass; all 45 existing app tests pass, including five-language parity and desk recovery rules.
- Browser preview checked at 393 × 852 and 320 × 710. Reviewed English, German and Spanish layouts, empty validation, a simulated invalid-credentials response, masked/revealed password, email-to-password keyboard focus, language changes retaining entered values, and Home with synthetic venue data. No page errors were observed. The web image's intrinsic-height issue was fixed by placing it inside an explicit aspect-ratio container. Password recovery requests `https://app.hexa-tech.uk/forgot-password`; the live reset form was opened read-only, without sending an email.
- Pixel 8 API 35 acceptance: native login layout, system font scale 1x → 2x → 1x, language sheet at enlarged text, email Next focusing password, password Go signing in with the isolated demo, Requests navigation, and force-stop/reopen restoring the signed-in Home all pass. The emulator's configured Gboard floating keyboard was opened; fields remained usable. The initial installed launch was signed out, so upgrade-session preservation is not claimed; the new session's restart persistence was verified.
- Current-process JavaScript/native error lines: **0**. Font and transition-animation scales were restored to 1.0, and the emulator was left signed in on Home. The UI hierarchy tool requires reduced motion for stable captures; screenshots taken during Activity recreation were discarded in favour of settled captures.
- Browser fixtures use synthetic credentials and never send demo credentials to the server. Real demo credentials stay outside git, chat and screenshots. Password recovery was inspected without sending a reset email. No loyalty balances, requests or card associations were changed by this visual acceptance pass.

## Android delivery

EAS Android preview **1.0.2 (3)**, build `c401ab2f-aef5-41d9-8aa5-3d6efd16f611`, finished **2026-11-04 18:55:30 UTC** from runtime commit `d02dee77ff12a4bec523d0312f04ce758a5d857f`.

- APK: https://expo.dev/artifacts/eas/ynSuPfKz44DjcWHsnpAEaqqVrXJgzErFs7L2LcKkCeU.apk
- Local file: `C:\Users\user6399\Downloads\HexaTech-Staff-Login-1.0.2.apk`
- SHA-256: `DB0B437AB262FFEFE279E5CFDA92A756CFF0C4D10E1FDA520D6CFFBDB274A351`
- Installed successfully with `adb install -r`; package inspection confirms version 1.0.2.
- Evidence: `login-wallpaper-20261104/login-native.png`, `home-native.png`, `login-large-text-native.png`, and browser captures in the same directory.

This is an Android preview delivery. No new iOS build or store submission was performed in this visual pass.
