# Staff iOS release verification - 8 November 2026

HexaTech Staff only: `uk.hexatech.loyalty.staff`, Apple ID **6829777674**, version **1.0.5 (3)**.

At 16:06 UTC / 18:06 Riga, Apple's API confirmed **PENDING_DEVELOPER_RELEASE**. After the owner restored browser authentication, the existing version already showed **Ready for Distribution**. At **16:11 UTC / 18:11 Riga**, Apple's API independently confirmed **READY_FOR_SALE**, selected build **3 VALID**. No release button was clicked by the agent in this continuation; the transition occurred during the owner's browser handoff.

Pricing and Availability explicitly confirms **unlisted distribution**, with the installation URL:
https://apps.apple.com/us/app/hexatech-staff/id6829777674

The console shows **175 Available** countries/regions. No availability, price, device support, screenshots, translations or review information was changed. The original video is still COMPLETE, notes and private reviewer credentials match. No rebuild, duplicate upload, Android/member-app change or Laravel deployment.

The US and GB App Store web links returned HTTP 404 during the initial post-release check at 16:10 UTC. Apple console/API release completion is verified; successful external installation/page propagation is not yet verified. Recheck the unlisted link before distributing it to staff. Do not resubmit or rebuild for this propagation check.

Source branch: `feature/staff-ios-release-20261105`. Native mirror: local `feature/loyalty-staff-release-20261102`, remote `feature/loyalty-staff-app`. Never merge native branches into Laravel main. Earlier build, review and unlisted request evidence: `docs/loyalty-staff-app/19-IOS-RELEASE-20261105.md` and `docs/handoff/2026-11-05-staff-ios-release.md`.
