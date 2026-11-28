using System;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

internal sealed class PcscException : InvalidOperationException
{
    public readonly uint Code;

    public PcscException(uint code, string message) : base(message) { Code = code; }
}

// Windows PC/SC helper. Reads only the public card UID with FF CA 00 00 00.
internal static class Pcsc
{
    internal const uint NoCard = 0x8010000C;
    internal const uint CardRemoved = 0x80100069;
    internal const uint NoReader = 0x8010002E;
    internal const uint ReaderUnavailable = 0x80100017;
    internal const uint ServiceUnavailable = 0x8010001D;
    internal const uint ServiceStopped = 0x8010001E;
    internal const uint SharingViolation = 0x8010000B;
    private const uint CardPresent = 0x0020;
    private const uint ReaderUnavailableFlags = 0x0004 | 0x0008;

    [StructLayout(LayoutKind.Sequential)] private struct IoRequest { public uint Protocol; public uint Length; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ReaderState
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string Reader;
        public IntPtr UserData;
        public uint CurrentState;
        public uint EventState;
        public uint AtrLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)] public byte[] Atr;
    }

    internal sealed class ContactlessReader
    {
        public readonly string Name;
        public readonly bool Present;
        public readonly uint CardChanges;

        public ContactlessReader(string name, uint eventState)
        {
            Name = name;
            Present = (eventState & CardPresent) != 0;
            CardChanges = eventState >> 16;
        }
    }

    [DllImport("winscard.dll")] private static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr context);
    [DllImport("winscard.dll")] private static extern int SCardReleaseContext(IntPtr context);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] private static extern int SCardListReadersW(IntPtr context, string groups, [Out] char[] readers, ref uint length);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] private static extern int SCardConnectW(IntPtr context, string reader, uint share, uint protocols, out IntPtr card, out uint active);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int SCardGetStatusChangeW(IntPtr context, uint timeout, [In, Out] ReaderState[] states, uint count);
    [DllImport("winscard.dll")] private static extern int SCardDisconnect(IntPtr card, uint disposition);
    [DllImport("winscard.dll")] private static extern int SCardTransmit(IntPtr card, ref IoRequest sendPci, byte[] send, uint length, IntPtr recvPci, [Out] byte[] recv, ref uint recvLength);

    private static void Check(int result)
    {
        if (result == 0) return;
        uint code = unchecked((uint)result);
        if (code == NoCard || code == CardRemoved) throw new PcscException(code, "Place a card on the selected reader, then press Read card.");
        if (code == NoReader || code == ReaderUnavailable) throw new PcscException(code, "Connect the ACR122U and press Refresh readers.");
        if (code == ServiceUnavailable || code == ServiceStopped) throw new PcscException(code, "Windows Smart Card service is unavailable. Check the reader driver with your administrator.");
        if (code == SharingViolation) throw new PcscException(code, "The reader is busy. Close other card applications and try again.");
        throw new PcscException(code, "The reader could not complete the request. Reconnect it and try again. (" + code.ToString("X8") + ")");
    }

    public static string[] Readers()
    {
        IntPtr context; Check(SCardEstablishContext(0, IntPtr.Zero, IntPtr.Zero, out context));
        try { return Readers(context); }
        finally { SCardReleaseContext(context); }
    }

    private static string[] Readers(IntPtr context)
    {
        uint length = 0;
        int result = SCardListReadersW(context, null, null, ref length);
        if (unchecked((uint)result) == NoReader) return new string[0];
        Check(result);
        if (length == 0 || length > 65536) return new string[0];
        char[] names = new char[length];
        Check(SCardListReadersW(context, null, names, ref length));
        return new string(names).Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
    }

    internal static ContactlessReader Acr122()
    {
        IntPtr context;
        Check(SCardEstablishContext(0, IntPtr.Zero, IntPtr.Zero, out context));
        try {
            string reader = Readers(context).FirstOrDefault(name => name.IndexOf("ACR122", StringComparison.OrdinalIgnoreCase) >= 0);
            if (reader == null) return null;
            var states = new[] { new ReaderState { Reader = reader, Atr = new byte[36] } };
            Check(SCardGetStatusChangeW(context, 0, states, 1));
            uint flags = states[0].EventState;
            return (flags & ReaderUnavailableFlags) != 0 ? null : new ContactlessReader(reader, flags);
        } finally { SCardReleaseContext(context); }
    }

    public static string Read(string reader)
    {
        if (String.IsNullOrWhiteSpace(reader)) throw new InvalidOperationException("Choose a reader first.");
        IntPtr context; Check(SCardEstablishContext(0, IntPtr.Zero, IntPtr.Zero, out context));
        IntPtr card = IntPtr.Zero;
        try {
            uint protocol; Check(SCardConnectW(context, reader, 2, 3, out card, out protocol));
            IoRequest pci = new IoRequest { Protocol = protocol, Length = (uint)Marshal.SizeOf(typeof(IoRequest)) };
            byte[] reply = new byte[258]; uint count = (uint)reply.Length;
            Check(SCardTransmit(card, ref pci, new byte[] { 0xFF, 0xCA, 0, 0, 0 }, 5, IntPtr.Zero, reply, ref count));
            return ParseUid(reply, count);
        } finally {
            if (card != IntPtr.Zero) SCardDisconnect(card, 0);
            SCardReleaseContext(context);
        }
    }

    internal static string ParseUid(byte[] reply, uint count)
    {
        // ISO14443 4/7/10-byte UIDs and FeliCa 8-byte identifiers. Never treat status bytes as the UID.
        if (reply == null || count > reply.Length || (count != 6 && count != 9 && count != 10 && count != 12)
            || reply[count - 2] != 0x90 || reply[count - 1] != 0) throw new InvalidOperationException("This card did not return a supported UID.");
        return BitConverter.ToString(reply, 0, (int)count - 2).Replace("-", "").ToLowerInvariant();
    }

    internal static int SelfTest()
    {
        if (ParseUid(new byte[] { 1, 2, 0xAB, 0xCD, 0x90, 0 }, 6) != "0102abcd") return 1;
        foreach (int n in new int[] { 4, 7, 8, 10 }) {
            byte[] bytes = Enumerable.Repeat((byte)0xAB, n + 2).ToArray(); bytes[n] = 0x90; bytes[n + 1] = 0;
            if (ParseUid(bytes, (uint)bytes.Length).Length != n * 2) return 2;
        }
        foreach (byte[] bad in new byte[][] { new byte[0], new byte[] { 0x90, 0 }, new byte[] { 1, 2, 3, 4, 0x63, 0 }, new byte[11] }) {
            try { ParseUid(bad, (uint)bad.Length); return 3; } catch (InvalidOperationException) { }
        }
        try { ParseUid(new byte[6], 999); return 4; } catch (InvalidOperationException) { }
        return 0;
    }
}

internal sealed class ReaderForm : Form
{
    private readonly ComboBox readers = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill };
    private readonly TextBox uid = new TextBox { ReadOnly = true, Dock = DockStyle.Fill, Font = new Font("Consolas", 16) };
    private readonly Label status = new Label { AutoSize = true, MaximumSize = new Size(500, 0) };
    private readonly Button refresh = new Button { Text = "Refresh readers", AutoSize = true };
    private readonly Button read = new Button { Text = "Read card", AutoSize = true };
    private readonly Button copy = new Button { Text = "Copy UID", AutoSize = true, Enabled = false };

    public ReaderForm(bool connected, Action backgroundReady)
    {
        Text = "HexaTech Windows NFC reader"; StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(560, 330); MinimumSize = new Size(510, 370); Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 8, AutoScroll = true };
        layout.Controls.Add(new Label { Text = "Windows NFC reader", Font = new Font("Segoe UI", 17, FontStyle.Bold), AutoSize = true });
        layout.Controls.Add(new Label {
            Text = connected
                ? "Connect the Windows reader in Loyalty, then place a card on the ACR122U."
                : "Loyalty could not connect to this window. Close other reader windows\nand reopen this one, or copy the card ID below.",
            AutoSize = true, ForeColor = connected ? Color.DarkGreen : Color.Firebrick,
        });
        layout.Controls.Add(readers);
        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill }; actions.Controls.Add(refresh); actions.Controls.Add(read); actions.Controls.Add(copy); layout.Controls.Add(actions);
        layout.Controls.Add(uid);
        layout.Controls.Add(new Label { Text = "For manual entry, read and copy the card ID.", AutoSize = true });
        layout.Controls.Add(status);
        var startup = new Button { Text = "Start reader with Windows", AutoSize = true };
        startup.Enabled = !ReaderStartup.IsEnabled();
        Activated += (s, e) => { startup.Enabled = !ReaderStartup.IsEnabled(); };
        startup.Click += (s, e) => {
            if (ReaderStartup.TryEnable()) {
                startup.Enabled = false;
                status.Text = "The reader will start with Windows. Find its icon near the clock.";
                backgroundReady();
            } else {
                status.Text = "Windows could not set up automatic startup. Close an older reader app and try again.";
            }
        };
        layout.Controls.Add(startup);
        Controls.Add(layout);
        Shown += async (s, e) => await RefreshReaders();
        refresh.Click += async (s, e) => await RefreshReaders();
        read.Click += async (s, e) => await ReadCard();
        copy.Click += (s, e) => {
            if (uid.Text.Length == 0) return;
            try { Clipboard.SetText(uid.Text); status.Text = "Card ID copied."; }
            catch (ExternalException) { status.Text = "Clipboard is busy. Select the card ID and copy it manually."; }
        };
        readers.SelectedIndexChanged += (s, e) => { uid.Clear(); copy.Enabled = false; };
    }

    private void Busy(bool busy) { refresh.Enabled = !busy; read.Enabled = !busy; readers.Enabled = !busy; copy.Enabled = !busy && uid.Text.Length > 0; }
    private async Task RefreshReaders()
    {
        Busy(true); uid.Clear(); status.Text = "Checking readers...";
        try {
            string[] names = await Task.Run(() => Pcsc.Readers());
            if (IsDisposed) return;
            readers.Items.Clear(); readers.Items.AddRange(names);
            if (names.Length > 0) readers.SelectedIndex = Math.Max(0, Array.FindIndex(names, n => n.IndexOf("ACR122", StringComparison.OrdinalIgnoreCase) >= 0));
            status.Text = names.Length > 0 ? "Place a card on the reader and press Read card." : "No PC/SC reader found. Connect it and refresh.";
        } catch (Exception ex) { if (!IsDisposed) status.Text = ex is InvalidOperationException ? ex.Message : "Windows could not access the reader."; }
        finally { if (!IsDisposed) Busy(false); }
    }
    private async Task ReadCard()
    {
        string selected = readers.SelectedItem as string; Busy(true); uid.Clear(); status.Text = "Reading...";
        try {
            string value = await Task.Run(() => Pcsc.Read(selected));
            if (!IsDisposed) { uid.Text = String.Join(":", Enumerable.Range(0, value.Length / 2).Select(i => value.Substring(i * 2, 2))).ToUpperInvariant(); status.Text = "Card read."; }
        }
        catch (Exception ex) { if (!IsDisposed) status.Text = ex is InvalidOperationException ? ex.Message : "Windows could not read this card."; }
        finally { if (!IsDisposed) Busy(false); }
    }
}

internal sealed class ReaderApplication : ApplicationContext
{
    private readonly NotifyIcon tray;
    private readonly ContextMenuStrip menu;
    private readonly bool connected;
    private ReaderForm form;
    private bool exiting;

    public ReaderApplication(bool connected, bool background)
    {
        this.connected = connected;
        menu = new ContextMenuStrip();
        tray = new NotifyIcon {
            Icon = SystemIcons.Application, Text = "HexaTech NFC reader",
            ContextMenuStrip = menu, Visible = background || (connected && ReaderStartup.IsEnabled()),
        };
        menu.Items.Add("Reader settings", null, (s, e) => ShowSettings());
        var disable = menu.Items.Add("Disable automatic startup", null, (s, e) => {
            ReaderStartup.Disable();
            ShowSettings();
        });
        menu.Items.Add("Exit reader", null, (s, e) => ExitThread());
        menu.Opening += (s, e) => { disable.Enabled = ReaderStartup.IsEnabled(); };
        tray.DoubleClick += (s, e) => ShowSettings();
        if (!background) ShowSettings();
    }

    private void ShowSettings()
    {
        if (form == null) {
            form = new ReaderForm(connected, () => { if (connected) tray.Visible = true; });
            form.FormClosed += (s, e) => {
                form = null;
                if (!exiting && !tray.Visible) ExitThread();
            };
            form.Show();
        }
        form.Activate();
    }

    protected override void ExitThreadCore()
    {
        exiting = true;
        if (form != null) form.Close();
        tray.Dispose();
        menu.Dispose();
        base.ExitThreadCore();
    }
}

internal static class Program
{
    [STAThread] private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test") {
            int pcsc = Pcsc.SelfTest();
            if (pcsc != 0) return pcsc;
            int bridgeResult = ReaderBridge.SelfTest();
            return bridgeResult != 0 ? bridgeResult : ReaderStartup.SelfTest();
        }
        if (args.Length == 1 && args[0] == "--enable-background") return ReaderStartup.TryEnable() ? 0 : 3;
        if (args.Length == 1 && args[0] == "--probe") {
            try { Console.WriteLine("PC/SC readers detected: " + Pcsc.Readers().Length); return 0; }
            catch (InvalidOperationException ex) { Console.WriteLine(ex.Message); return 2; }
        }
        bool background = args.Length == 1 && args[0] == "--background";
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        using (var bridge = new ReaderBridge()) {
            bool connected = bridge.Start();
            if (!background || connected) Application.Run(new ReaderApplication(connected, background));
        }
        return 0;
    }
}
