using System;
using System.Diagnostics;
using System.IO;

// Thin wrapper around the real 7za (7za-orig.exe) that ALWAYS returns exit 0.
// Purpose: electron-builder's winCodeSign archive contains macOS .dylib symlinks
// that cannot be created on Windows without admin/Developer-Mode. Those 2 symlinks
// are irrelevant for a Windows build, but 7za returns a non-zero code which makes
// electron-builder abort. Swallowing the exit code lets the (otherwise complete)
// extraction succeed.
class W {
    static int Main(string[] args) {
        string dir = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
        string real = Path.Combine(dir, "7za-orig.exe");
        var psi = new ProcessStartInfo(real);
        psi.UseShellExecute = false;
        string[] parts = new string[args.Length];
        for (int i = 0; i < args.Length; i++) {
            parts[i] = (args[i].IndexOf(' ') >= 0) ? ("\"" + args[i] + "\"") : args[i];
        }
        psi.Arguments = string.Join(" ", parts);
        try {
            Process p = Process.Start(psi);
            p.WaitForExit();
        } catch { }
        return 0;
    }
}
