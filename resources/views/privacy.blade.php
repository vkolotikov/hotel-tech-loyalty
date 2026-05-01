<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Privacy Policy — Hotel Tech</title>
    <meta name="description" content="Privacy Policy for Hotel Loyalty, Hotel Staff and the Hotel Tech platform (FDS Cards Ltd).">
    <meta name="robots" content="index, follow">
    <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>🏨</text></svg>">
    <style>
        :root {
            --bg: #0b0f14;
            --surface: #11161d;
            --border: #1f2733;
            --text: #e6edf3;
            --text2: #b9c4d0;
            --text3: #6e7d8e;
            --accent: #0ea5e9;
        }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: var(--bg);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 15px;
            line-height: 1.65;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        .container {
            max-width: 760px;
            margin: 0 auto;
            padding: 56px 24px 96px;
        }
        header {
            border-bottom: 1px solid var(--border);
            padding-bottom: 24px;
            margin-bottom: 40px;
        }
        h1 {
            font-size: 32px;
            line-height: 1.2;
            margin: 0 0 8px;
            letter-spacing: -0.02em;
        }
        h2 {
            font-size: 20px;
            margin: 40px 0 12px;
            color: var(--text);
            letter-spacing: -0.01em;
        }
        h3 {
            font-size: 16px;
            margin: 24px 0 8px;
            color: var(--text);
        }
        p, ul, ol { color: var(--text2); margin: 12px 0; }
        ul, ol { padding-left: 22px; }
        li { margin: 6px 0; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; }
        .meta { color: var(--text3); font-size: 13px; }
        .meta strong { color: var(--text2); font-weight: 600; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0 24px;
            font-size: 14px;
        }
        th, td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
            color: var(--text2);
        }
        th {
            color: var(--text);
            font-weight: 600;
            background: var(--surface);
        }
        td:first-child { color: var(--text); font-weight: 500; }
        .callout {
            background: var(--surface);
            border: 1px solid var(--border);
            border-left: 3px solid var(--accent);
            border-radius: 8px;
            padding: 14px 18px;
            margin: 20px 0;
            color: var(--text2);
        }
        footer {
            margin-top: 64px;
            padding-top: 24px;
            border-top: 1px solid var(--border);
            color: var(--text3);
            font-size: 13px;
        }
        @media (max-width: 600px) {
            .container { padding: 32px 18px 64px; }
            h1 { font-size: 26px; }
            h2 { font-size: 18px; }
        }
    </style>
</head>
<body>
<div class="container">
    <header>
        <h1>Privacy Policy</h1>
        <p class="meta">
            <strong>Hotel Tech platform · Hotel Loyalty + Hotel Staff mobile apps</strong><br>
            Last updated: {{ \Carbon\Carbon::parse('2026-05-01')->format('F j, Y') }} ·
            Effective: {{ \Carbon\Carbon::parse('2026-05-01')->format('F j, Y') }}
        </p>
    </header>

    <p>
        This Privacy Policy explains how <strong>FDS Cards Ltd</strong> ("we", "us", "our") collects,
        uses, shares and safeguards personal data when you use the
        <strong>Hotel Loyalty</strong> mobile app, the <strong>Hotel Staff</strong> mobile app, and
        the related Hotel Tech web platform at <a href="https://loyalty.hotel-tech.ai">loyalty.hotel-tech.ai</a>
        (together, the "Service"). By using the Service you agree to the practices described below.
    </p>

    <div class="callout">
        <strong>TL;DR:</strong> we collect the data needed to run your loyalty membership and your
        hotel stays — name, email, phone, booking history, points. We do not sell your data, do not
        track you across other apps, do not run advertising SDKs. You can delete your account at any
        time and we'll erase your data within 30 days, except where law requires us to keep it longer
        (e.g. financial records).
    </div>

    <h2>1. Who is the data controller?</h2>
    <p>
        <strong>FDS Cards Ltd</strong> is the data controller for personal data processed through the Service.
    </p>
    <ul>
        <li>Email for privacy enquiries: <a href="mailto:vitaly@fds-cards.co.uk">vitaly@fds-cards.co.uk</a></li>
        <li>Postal address: available on request to the email above.</li>
    </ul>
    <p>
        For stays at a specific hotel, the hotel itself is a joint controller of your reservation,
        guest profile and any chat messages you exchange with that hotel's team. The hotel is
        identified inside the app (under your bookings and chat threads).
    </p>

    <h2>2. What data we collect</h2>

    <h3>2.1 Data you provide directly</h3>
    <table>
        <thead><tr><th>Category</th><th>Examples</th></tr></thead>
        <tbody>
            <tr><td>Account</td><td>Name, email, phone (optional), password (stored hashed only), profile photo</td></tr>
            <tr><td>Membership</td><td>NFC loyalty card UID (used purely as a member identifier), QR member code</td></tr>
            <tr><td>Reservations</td><td>Stay dates, room or service selected, party size, special requests, payment status</td></tr>
            <tr><td>Communications</td><td>Messages you send to the hotel team via in-app chat, support emails</td></tr>
            <tr><td>Preferences</td><td>Language, push-notification preferences, marketing opt-ins</td></tr>
        </tbody>
    </table>

    <h3>2.2 Data generated by your use of the Service</h3>
    <table>
        <thead><tr><th>Category</th><th>Examples</th></tr></thead>
        <tbody>
            <tr><td>Loyalty activity</td><td>Points earned and redeemed, tier progression, redeemed offers</td></tr>
            <tr><td>Stay history</td><td>Past and upcoming bookings, check-in / check-out events</td></tr>
            <tr><td>Notifications</td><td>Apple Push Notification token (member app only) so we can send reminders</td></tr>
            <tr><td>Technical</td><td>IP address (for rate-limiting and abuse prevention), user agent, app version</td></tr>
            <tr><td>Diagnostics</td><td>Server-side error logs (no third-party crash analytics SDKs are bundled)</td></tr>
        </tbody>
    </table>

    <h3>2.3 What we do NOT collect</h3>
    <ul>
        <li>Precise location data (we never request GPS).</li>
        <li>Health data, financial-account credentials, or social-network friend lists.</li>
        <li>Tracking identifiers used to follow you across apps or websites (no IDFA usage).</li>
        <li>Browsing behaviour outside the Service.</li>
    </ul>

    <h2>3. Why we use the data (legal bases under UK & EU GDPR)</h2>
    <table>
        <thead><tr><th>Purpose</th><th>Legal basis</th></tr></thead>
        <tbody>
            <tr>
                <td>Run your loyalty membership and process your reservations</td>
                <td>Contract (UK GDPR Art. 6(1)(b))</td>
            </tr>
            <tr>
                <td>Send transactional emails and push notifications (booking confirmations, points balance, reservation reminders)</td>
                <td>Contract (UK GDPR Art. 6(1)(b))</td>
            </tr>
            <tr>
                <td>Send marketing communications (only if you opt in)</td>
                <td>Consent (UK GDPR Art. 6(1)(a))</td>
            </tr>
            <tr>
                <td>Prevent fraud, secure the Service, debug technical issues</td>
                <td>Legitimate interests (UK GDPR Art. 6(1)(f))</td>
            </tr>
            <tr>
                <td>Comply with tax, accounting and consumer-protection laws</td>
                <td>Legal obligation (UK GDPR Art. 6(1)(c))</td>
            </tr>
        </tbody>
    </table>

    <h2>4. Who we share data with</h2>
    <p>
        We do not sell your data. We share it only with the categories of recipients below, all of
        whom are bound by confidentiality and data-processing agreements:
    </p>
    <table>
        <thead><tr><th>Recipient</th><th>Purpose</th><th>Region</th></tr></thead>
        <tbody>
            <tr>
                <td>The hotel(s) you stay at</td>
                <td>Run your reservation, recognise you on arrival, deliver loyalty perks</td>
                <td>Hotel's location (typically EU/UK)</td>
            </tr>
            <tr>
                <td>DigitalOcean</td>
                <td>Hosting and database storage</td>
                <td>EU</td>
            </tr>
            <tr>
                <td>Smoobu (Bookingsync GmbH)</td>
                <td>Property-management synchronisation when your stay involves a Smoobu-managed unit</td>
                <td>EU (Germany)</td>
            </tr>
            <tr>
                <td>Stripe Payments Europe Ltd</td>
                <td>Process payments you make through the Service</td>
                <td>EU (Ireland)</td>
            </tr>
            <tr>
                <td>OpenAI Ireland Ltd</td>
                <td>Generate chatbot replies when you message the hotel via the AI chat (only message content is sent — never your account credentials)</td>
                <td>EU / US (with EU-US Data Privacy Framework safeguards)</td>
            </tr>
            <tr>
                <td>Anthropic, PBC</td>
                <td>Power the staff-side admin assistant. Member personal data is sent only when a staff user explicitly queries that member's record.</td>
                <td>US (Standard Contractual Clauses)</td>
            </tr>
            <tr>
                <td>Apple Inc. / Google LLC</td>
                <td>Deliver push notifications via APNs and FCM</td>
                <td>US (SCCs / DPF)</td>
            </tr>
            <tr>
                <td>Tax authorities, regulators, courts</td>
                <td>When legally compelled</td>
                <td>Jurisdiction-dependent</td>
            </tr>
        </tbody>
    </table>
    <p>
        Where data is transferred outside the UK / European Economic Area, we rely on the EU-US Data
        Privacy Framework (where applicable), the UK International Data Transfer Addendum, or
        Standard Contractual Clauses adopted by the European Commission.
    </p>

    <h2>5. How long we keep the data</h2>
    <table>
        <thead><tr><th>Data</th><th>Retention</th></tr></thead>
        <tbody>
            <tr><td>Account profile</td><td>For the lifetime of your account, then 30 days after a deletion request</td></tr>
            <tr><td>Booking and payment records</td><td>7 years (statutory accounting requirement under UK Companies Act 2006)</td></tr>
            <tr><td>Loyalty points ledger</td><td>While the account exists; an immutable audit trail is kept for 7 years for tax purposes</td></tr>
            <tr><td>Chat messages with the hotel team</td><td>12 months from last activity</td></tr>
            <tr><td>Server logs (IP, user agent, request paths)</td><td>90 days</td></tr>
            <tr><td>Marketing-consent records</td><td>3 years after withdrawal of consent</td></tr>
        </tbody>
    </table>

    <h2>6. Your rights</h2>
    <p>
        Under UK GDPR and the EU GDPR you have the following rights, exercisable free of charge:
    </p>
    <ul>
        <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
        <li><strong>Rectification</strong> — ask us to correct inaccurate data.</li>
        <li><strong>Erasure</strong> ("right to be forgotten") — request deletion of your data,
            subject to retention obligations above.</li>
        <li><strong>Portability</strong> — receive your data in a structured, commonly used,
            machine-readable format.</li>
        <li><strong>Restriction</strong> — ask us to limit processing in certain circumstances.</li>
        <li><strong>Objection</strong> — object to processing based on legitimate interests or for direct marketing.</li>
        <li><strong>Withdraw consent</strong> — at any time, where processing is based on consent.</li>
        <li><strong>Lodge a complaint</strong> with the UK Information Commissioner's Office (<a href="https://ico.org.uk">ico.org.uk</a>)
            or your local EU data-protection authority.</li>
    </ul>
    <p>
        To exercise any of these rights, email
        <a href="mailto:vitaly@fds-cards.co.uk">vitaly@fds-cards.co.uk</a>.
        We will respond within one calendar month.
    </p>
    <p>
        You can also delete your account directly from inside the Hotel Loyalty mobile app:
        <em>Profile → Account → Delete Account</em>.
    </p>

    <h2>7. Security</h2>
    <ul>
        <li>All traffic between the apps and our servers is encrypted with TLS 1.2+ (HTTPS).</li>
        <li>Passwords are hashed with bcrypt; we never store or transmit them in clear text.</li>
        <li>Database storage and automated backups are encrypted at rest.</li>
        <li>Mobile app session tokens are stored in the device's secure enclave (iOS Keychain / Android Keystore via Expo SecureStore).</li>
        <li>Access to production systems is restricted to named administrators using two-factor authentication.</li>
        <li>Significant administrative actions (member edits, points operations, settings changes) are written to an immutable audit log.</li>
    </ul>

    <h2>8. Children</h2>
    <p>
        The Service is intended for users aged 16 and over. We do not knowingly collect personal data
        from anyone under 16. If you believe a minor has provided personal data to us, contact
        <a href="mailto:vitaly@fds-cards.co.uk">vitaly@fds-cards.co.uk</a> and we will delete it.
    </p>

    <h2>9. Cookies and similar technologies</h2>
    <p>
        Our mobile apps do not use browser cookies. The web admin panel sets a single first-party
        session cookie (<code>laravel_session</code>) that is strictly necessary for authentication
        and is not used for tracking or advertising.
    </p>

    <h2>10. Tracking transparency (Apple ATT)</h2>
    <p>
        Neither app uses Apple's App Tracking Transparency framework because we do not track you
        across other apps or websites. Both apps declare "Data Not Used to Track You" on their App
        Store privacy nutrition label.
    </p>

    <h2>11. Changes to this Policy</h2>
    <p>
        We may update this Policy when our practices change or when required by law. Material
        changes will be communicated to active users through an in-app notice or email at least 14
        days before they take effect. The "Last updated" date at the top of this page indicates the
        most recent revision.
    </p>

    <h2>12. Contact us</h2>
    <p>
        Questions, concerns or requests about this Privacy Policy or your personal data should be
        sent to <a href="mailto:vitaly@fds-cards.co.uk">vitaly@fds-cards.co.uk</a>.
    </p>

    <footer>
        <p>
            FDS Cards Ltd ·
            <a href="https://loyalty.hotel-tech.ai">loyalty.hotel-tech.ai</a> ·
            <a href="mailto:vitaly@fds-cards.co.uk">vitaly@fds-cards.co.uk</a>
        </p>
    </footer>
</div>
</body>
</html>
