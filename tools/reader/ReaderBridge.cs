using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

// One read-only endpoint for the browser. Bind directly to loopback as a standard Windows user.
internal sealed class ReaderBridge : IDisposable
{
    public const int Port = 17432;
    private const string Host = "127.0.0.1:17432";
    private const string Path = "/v1/reader";
    private const string ClientHeader = "X-HexaTech-Reader";
    private const int MaxHeaderBytes = 4096;
    private static readonly HashSet<string> Origins = new HashSet<string>(StringComparer.Ordinal) {
        "https://loyalty.hotel-tech.ai",
        "https://app.hexa-tech.uk",
    };

    private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
    private volatile bool running;
    private string lastReader;
    private uint lastCardChange;
    private string cardReply;

    public bool Start()
    {
        try {
            listener.ExclusiveAddressUse = true;
            listener.Start(4);
        } catch (SocketException) { return false; }

        running = true;
        new Thread(Accept) { IsBackground = true, Name = "Loyalty NFC" }.Start();
        return true;
    }

    public void Dispose()
    {
        running = false;
        listener.Stop();
    }

    private void Accept()
    {
        while (running) {
            try {
                using (var client = listener.AcceptTcpClient()) {
                    client.ReceiveTimeout = 1500;
                    client.SendTimeout = 1500;
                    using (var stream = client.GetStream()) Reply(stream);
                }
            } catch (IOException) { /* A browser tab may stop a request while closing. */ }
            catch (SocketException) { if (!running) return; }
            catch (InvalidOperationException) { if (!running) return; throw; }
        }
    }

    private void Reply(Stream stream)
    {
        string origin;
        string method = AuthorizedMethod(ReadHeaders(stream), out origin);
        if (method == null) {
            WriteResponse(stream, "403 Forbidden", null, "");
        } else if (method == "OPTIONS") {
            WriteResponse(stream, "204 No Content", origin, "");
        } else {
            WriteResponse(stream, "200 OK", origin, Snapshot());
        }
    }

    private static string ReadHeaders(Stream stream)
    {
        var read = new StringBuilder();
        var deadline = Stopwatch.StartNew();
        int last = 0;
        while (read.Length < MaxHeaderBytes && deadline.ElapsedMilliseconds < 1500) {
            int next = stream.ReadByte();
            if (next < 0) return null;
            read.Append((char)next);
            last = unchecked((last << 8) | next);
            if (last == 0x0D0A0D0A) return read.ToString();
        }
        return null;
    }

    private static string AuthorizedMethod(string headers, out string origin)
    {
        origin = null;
        if (headers == null) return null;
        string[] lines = headers.Split(new[] { "\r\n" }, StringSplitOptions.None);
        string[] request = lines[0].Split(' ');
        if (request.Length != 3 || request[1] != Path || request[2] != "HTTP/1.1") return null;

        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 1; i < lines.Length - 2; i++) {
            int colon = lines[i].IndexOf(':');
            if (colon <= 0) return null;
            string name = lines[i].Substring(0, colon);
            if (fields.ContainsKey(name) || name.Trim() != name) return null;
            fields.Add(name, lines[i].Substring(colon + 1).Trim());
        }

        string host, suppliedOrigin, size;
        if (!fields.TryGetValue("Host", out host) || host != Host
            || !fields.TryGetValue("Origin", out suppliedOrigin) || !Origins.Contains(suppliedOrigin)
            || fields.ContainsKey("Transfer-Encoding")
            || (fields.TryGetValue("Content-Length", out size) && size != "0")) return null;

        string value;
        if (request[0] == "GET" && fields.TryGetValue(ClientHeader, out value) && value == "1") {
            origin = suppliedOrigin;
            return "GET";
        }
        string asked;
        if (request[0] == "OPTIONS" && fields.TryGetValue("Access-Control-Request-Method", out value) && value == "GET"
            && fields.TryGetValue("Access-Control-Request-Headers", out asked) && String.Equals(asked, ClientHeader, StringComparison.OrdinalIgnoreCase)) {
            origin = suppliedOrigin;
            return "OPTIONS";
        }
        return null;
    }

    private static void WriteResponse(Stream stream, string status, string origin, string body)
    {
        var headers = new StringBuilder("HTTP/1.1 " + status + "\r\nConnection: close\r\nCache-Control: no-store\r\n");
        if (origin != null) {
            headers.Append("Access-Control-Allow-Origin: ").Append(origin).Append("\r\nVary: Origin\r\n");
            if (status == "204 No Content") {
                headers.Append("Access-Control-Allow-Methods: GET\r\nAccess-Control-Allow-Headers: ").Append(ClientHeader)
                    .Append("\r\nAccess-Control-Max-Age: 600\r\n");
            }
        }
        if (status != "204 No Content") {
            headers.Append("Content-Type: application/json\r\nX-Content-Type-Options: nosniff\r\nContent-Length: ").Append(body.Length).Append("\r\n");
        }
        headers.Append("\r\n").Append(body);
        byte[] data = Encoding.ASCII.GetBytes(headers.ToString());
        stream.Write(data, 0, data.Length);
    }

    private static string State(string state) { return "{\"version\":1,\"state\":\"" + state + "\"}"; }

    private string Snapshot()
    {
        try { return Snapshot(Pcsc.Acr122(), Pcsc.Read); }
        catch (PcscException ex) {
            switch (ex.Code) {
                case Pcsc.NoCard:
                case Pcsc.CardRemoved: return Snapshot(null, Pcsc.Read, "waiting");
                case Pcsc.NoReader:
                case Pcsc.ReaderUnavailable: return Snapshot(null, Pcsc.Read);
                case Pcsc.ServiceUnavailable:
                case Pcsc.ServiceStopped: return State("service");
                case Pcsc.SharingViolation: return State("busy");
                default: return State("unreadable");
            }
        } catch (InvalidOperationException) { return State("unreadable"); }
    }

    private string Snapshot(Pcsc.ContactlessReader reader, Func<string, string> read, string absent = "no_reader")
    {
        if (reader == null || !reader.Present) {
            lastReader = null;
            cardReply = null;
            return State(reader == null ? absent : "waiting");
        }
        if (cardReply == null || lastReader != reader.Name || lastCardChange != reader.CardChanges) {
            string uid = read(reader.Name);
            cardReply = "{\"version\":1,\"state\":\"card\",\"uid\":\"" + uid
                + "\",\"presentation\":\"" + Guid.NewGuid().ToString("N") + "\"}";
            lastReader = reader.Name;
            lastCardChange = reader.CardChanges;
        }
        return cardReply;
    }

    internal static int SelfTest()
    {
        string origin;
        const string allowed = "https://loyalty.hotel-tech.ai";
        const string headers = "Host: " + Host + "\r\nOrigin: " + allowed + "\r\n";
        const string get = "GET " + Path + " HTTP/1.1\r\n" + headers + ClientHeader + ": 1\r\n\r\n";
        const string preflight = "OPTIONS " + Path + " HTTP/1.1\r\n" + headers
            + "Access-Control-Request-Method: GET\r\nAccess-Control-Request-Headers: x-hexatech-reader\r\n\r\n";
        if (AuthorizedMethod(get, out origin) != "GET" || origin != allowed) return 11;
        if (AuthorizedMethod(preflight, out origin) != "OPTIONS" || origin != allowed) return 12;
        if (AuthorizedMethod(get.Replace(allowed, "https://other.example"), out origin) != null
            || AuthorizedMethod(get.Replace(Host, "other.example"), out origin) != null
            || AuthorizedMethod(get.Replace(Path, "/"), out origin) != null
            || AuthorizedMethod(get.Replace(ClientHeader, "Other"), out origin) != null
            || AuthorizedMethod(get.Replace("GET", "POST"), out origin) != null) return 13;

        using (var sample = new ReaderBridge()) {
            int reads = 0;
            Func<string, string> read = _ => { reads++; return "01020304"; };
            var present = new Pcsc.ContactlessReader("ACS ACR122", 0x00010020);
            string first = sample.Snapshot(present, read);
            if (sample.Snapshot(present, read) != first || reads != 1) return 14;
            var returned = new Pcsc.ContactlessReader("ACS ACR122", 0x00030020);
            string next = sample.Snapshot(returned, read);
            if (next == first || reads != 2) return 15;
            var removed = new Pcsc.ContactlessReader("ACS ACR122", 0x00040010);
            if (sample.Snapshot(removed, read) != State("waiting") || reads != 2) return 16;
            if (sample.Snapshot(returned, read) == next || reads != 3) return 17;
        }
        return 0;
    }
}
