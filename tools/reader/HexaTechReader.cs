using System;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

// Windows PC/SC helper. Reads only the public card UID with FF CA 00 00 00.
// No network listener, credentials, card writes, keyboard injection or background service.
internal static class Pcsc
{
    [StructLayout(LayoutKind.Sequential)] private struct IoRequest { public uint Protocol; public uint Length; }
    [DllImport("winscard.dll")] private static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr context);
    [DllImport("winscard.dll")] private static extern int SCardReleaseContext(IntPtr context);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] private static extern int SCardListReadersW(IntPtr context, string groups, [Out] char[] readers, ref uint length);
    [DllImport("winscard.dll", CharSet = CharSet.Unicode)] private static extern int SCardConnectW(IntPtr context, string reader, uint share, uint protocols, out IntPtr card, out uint active);
    [DllImport("winscard.dll")] private static extern int SCardDisconnect(IntPtr card, uint disposition);
    [DllImport("winscard.dll")] private static extern int SCardTransmit(IntPtr card, ref IoRequest sendPci, byte[] send, uint length, IntPtr recvPci, [Out] byte[] recv, ref uint recvLength);

    private static void Check(int result)
    {
        if (result == 0) return;
        uint code = unchecked((uint)result);
        if (code == 0x8010000C || code == 0x80100069) throw new InvalidOperationException("Place a card on the selected reader, then press Read card.");
        if (code == 0x8010002E) throw new InvalidOperationException("No PC/SC reader found. Connect the ACR122U and press Refresh readers.");
        if (code == 0x8010001D) throw new InvalidOperationException("Windows Smart Card service is unavailable. Check the reader driver with your administrator.");
        if (code == 0x8010000B) throw new InvalidOperationException("The reader is busy. Close other card applications and try again.");
        throw new InvalidOperationException("The reader could not complete the request. Reconnect it and try again. (" + code.ToString("X8") + ")");
    }

    public static string[] Readers()
    {
        IntPtr context; Check(SCardEstablishContext(0, IntPtr.Zero, IntPtr.Zero, out context));
        try {
            uint length = 0; int result = SCardListReadersW(context, null, null, ref length);
            if (unchecked((uint)result) == 0x8010002E) return new string[0];
            Check(result);
            if (length == 0 || length > 65536) return new string[0];
            char[] names = new char[length]; Check(SCardListReadersW(context, null, names, ref length));
            return new string(names).Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
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
        Console.WriteLine("Reader protocol self-tests passed. Physical reader not tested.");
        return 0;
    }
}

internal sealed class ReaderForm : Form
{
    private readonly ComboBox readers = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill };
    private readonly TextBox uid = new TextBox { ReadOnly = true, Dock = DockStyle.Fill, Font = new Font("Consolas", 16) };
    private readonly Label status = new Label { AutoSize = true, MaximumSize = new Size(510, 0), Text = "Connect your ACR122U, then refresh readers." };
    private readonly Button refresh = new Button { Text = "Refresh readers", AutoSize = true };
    private readonly Button read = new Button { Text = "Read card", AutoSize = true };
    private readonly Button copy = new Button { Text = "Copy UID", AutoSize = true, Enabled = false };

    public ReaderForm()
    {
        Text = "HexaTech - PC/SC reader preview"; StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(550, 350); MinimumSize = new Size(500, 390); Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 8 };
        layout.Controls.Add(new Label { Text = "Scan a membership card", Font = new Font("Segoe UI", 17, FontStyle.Bold), AutoSize = true });
        layout.Controls.Add(new Label { Text = "1. Select your reader and place a card on it.", AutoSize = true });
        layout.Controls.Add(readers);
        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill }; actions.Controls.Add(refresh); actions.Controls.Add(read); actions.Controls.Add(copy); layout.Controls.Add(actions);
        layout.Controls.Add(uid);
        layout.Controls.Add(new Label { Text = "2. Copy the UID. In HexaTech, paste it into Scan a member\nand press Find member, or use it when linking a card.", AutoSize = true });
        layout.Controls.Add(status);
        layout.Controls.Add(new Label { Text = "Windows preview - physical ACR122U acceptance is still required.\nReads the card identifier only. Nothing is sent automatically.", AutoSize = true, ForeColor = Color.DimGray });
        Controls.Add(layout);
        refresh.Click += async (s, e) => await RefreshReaders();
        read.Click += async (s, e) => await ReadCard();
        copy.Click += (s, e) => {
            if (uid.Text.Length == 0) return;
            try { Clipboard.SetText(uid.Text); status.Text = "UID copied. Paste it into HexaTech's scan field."; }
            catch (ExternalException) { status.Text = "Clipboard is busy. Select the UID and copy it manually."; }
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
        try { string value = await Task.Run(() => Pcsc.Read(selected)); if (!IsDisposed) { uid.Text = value; status.Text = "Card read. Copy the UID to continue in HexaTech."; } }
        catch (Exception ex) { if (!IsDisposed) status.Text = ex is InvalidOperationException ? ex.Message : "Windows could not read this card."; }
        finally { if (!IsDisposed) Busy(false); }
    }
}

internal static class Program
{
    [STAThread] private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--self-test") return Pcsc.SelfTest();
        if (args.Length == 1 && args[0] == "--probe") {
            try { Console.WriteLine("PC/SC readers detected: " + Pcsc.Readers().Length); return 0; }
            catch (InvalidOperationException ex) { Console.WriteLine(ex.Message); return 2; }
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ReaderForm()); return 0;
    }
}
