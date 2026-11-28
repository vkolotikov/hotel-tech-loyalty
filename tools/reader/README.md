# HexaTech Windows NFC reader

On each PC with an ACR122U, download **Windows reader** from Loyalty and open it once. Choose **Start reader with Windows** and close its window. The reader keeps running near the Windows clock and starts automatically when that Windows user signs in. Its menu opens **Reader settings**, disables automatic startup, or exits the reader.

In Loyalty, use **Windows NFC reader** in **Scan a member**, **Pair NFC**, or **Assign member**. Choose **Connect Windows reader** once per browser and allow local or loopback access if prompted. Tap the card. Staff confirm a pairing or assignment in Loyalty. The Windows **Read card** and **Copy UID** buttons are available under **Reader settings**.

The .NET Framework app uses the Windows Smart Card driver and reads the UID on demand. Automatic startup copies the app to this user's local application data and registers it under the current user's Run key. The reader's connection listens on `127.0.0.1:17432` and accepts browser requests from `https://loyalty.hotel-tech.ai` and `https://app.hexa-tech.uk`. The browser asks for readings while the reader panel is open in the active window. The app keeps the current presentation in memory. Loyalty checks membership and handles assignments in the signed-in company.

Build with `powershell -File tools/reader/build.ps1` on Windows. It builds `public/downloads/hexatech-reader.exe`, runs self-tests and prints its SHA-256. The download is unsigned. The tests cover UID replies, allowed browser origins, one reading per card presentation and the startup command for paths with spaces. To update an installed reader, exit the previous version from its tray menu before running the new setup.

See the [Microsoft PC/SC functions](https://learn.microsoft.com/en-us/windows/win32/secauthn/smart-card-and-reader-access-functions), [ACS ACR122U API](https://www.acs.com.hk/en/download-manual/419/API-ACR122U-2.04.pdf) and [Chrome loopback permission guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access).
