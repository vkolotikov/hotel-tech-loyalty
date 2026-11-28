using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Windows.Forms;
using Microsoft.Win32;

// The signed-in Windows user owns this startup entry. No system service or administrator rights are needed.
internal static class ReaderStartup
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Entry = "HexaTechNfcReader";
    internal static readonly string InstallPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HexaTech", "NfcReader", "hexatech-reader.exe");

    private static string Command(string executable) { return "\"" + executable + "\" --background"; }

    public static bool IsEnabled()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(RunKey)) {
            return key != null && Equals(key.GetValue(Entry), Command(InstallPath)) && File.Exists(InstallPath);
        }
    }

    public static bool TryEnable()
    {
        try {
            string source = Application.ExecutablePath;
            if (!String.Equals(source, InstallPath, StringComparison.OrdinalIgnoreCase)
                && (!File.Exists(InstallPath) || !Digest(source).SequenceEqual(Digest(InstallPath)))) {
                Directory.CreateDirectory(Path.GetDirectoryName(InstallPath));
                File.Copy(source, InstallPath, true);
            }
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey)) key.SetValue(Entry, Command(InstallPath), RegistryValueKind.String);
            return true;
        } catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
        catch (System.Security.SecurityException) { return false; }
    }

    public static void Disable()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(RunKey, true)) {
            if (key != null && Equals(key.GetValue(Entry), Command(InstallPath))) key.DeleteValue(Entry, false);
        }
    }

    private static byte[] Digest(string path)
    {
        using (var hash = SHA256.Create())
        using (var input = File.OpenRead(path)) return hash.ComputeHash(input);
    }

    internal static int SelfTest()
    {
        return Command(@"C:\Path With Spaces\hexatech-reader.exe") == "\"C:\\Path With Spaces\\hexatech-reader.exe\" --background" ? 0 : 21;
    }
}
