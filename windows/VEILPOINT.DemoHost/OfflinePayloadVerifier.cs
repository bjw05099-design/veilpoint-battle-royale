using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace VEILPOINT.DemoHost;

// Protects against incomplete ZIP extraction, unintended file additions and
// accidental corruption. The manifest is not a signed publisher certificate:
// an attacker able to change both the files and manifest can bypass it.
internal static class OfflinePayloadVerifier
{
    private const int MaxEntries = 128;
    private const long MaxTotalBytes = 16 * 1024 * 1024;
    private const long MaxFileBytes = 2 * 1024 * 1024;
    private static readonly Regex RelativeName = new(
        @"^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static void Verify(string gameFolder) =>
        VerifyInternal(gameFolder, storyOnlyPackage: false);

    // Only the story-specific ZIP closure is accepted. A corrupted mixed
    // package cannot be silently relabeled because every manifest entry and
    // required-mode entry is still independently checked.
    public static void VerifyStoryOnly(string gameFolder) =>
        VerifyInternal(gameFolder, storyOnlyPackage: true);

    private static void VerifyInternal(string gameFolder, bool storyOnlyPackage)
    {
        var root = Path.GetFullPath(gameFolder);
        if (!Directory.Exists(root))
            throw new InvalidDataException("The bundled offline game/ directory is missing.");
        if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("The game directory cannot be a symlink.");
        var manifestPath = Path.Combine(root, "MANIFEST.sha256");
        if (!File.Exists(manifestPath))
            throw new InvalidDataException("Offline MANIFEST.sha256 is missing.");
        var manifestBytes = new FileInfo(manifestPath).Length;
        if (manifestBytes < 64 || manifestBytes > 128 * 1024)
            throw new InvalidDataException("Offline manifest size is not valid.");

        var lines = File.ReadAllLines(manifestPath, Encoding.UTF8);
        if (lines.Length < 5 || lines.Length > MaxEntries)
            throw new InvalidDataException("Offline manifest has an invalid entry count.");
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long totalBytes = 0;
        foreach (var line in lines)
        {
            if (line.Length < 67 || line[64] != ' ' || line[65] != ' ')
                throw new InvalidDataException("Malformed offline SHA-256 entry.");
            var expected = line[..64];
            var relative = line[66..];
            if (!Regex.IsMatch(expected, @"\A[a-f0-9]{64}\z", RegexOptions.CultureInvariant) ||
                !RelativeName.IsMatch(relative) || !seen.Add(relative))
                throw new InvalidDataException("Unsafe or duplicate offline manifest path.");
            var file = Path.GetFullPath(Path.Combine(root,
                relative.Replace('/', Path.DirectorySeparatorChar)));
            if (!file.StartsWith(root + Path.DirectorySeparatorChar,
                    StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(file))
                throw new InvalidDataException("Missing or escaped offline manifest entry: " + relative);
            if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("Symlinked offline asset: " + relative);
            for (var parent = Directory.GetParent(file); parent is not null &&
                 !parent.FullName.Equals(root, StringComparison.OrdinalIgnoreCase);
                 parent = parent.Parent)
            {
                if ((parent.Attributes & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Symlinked offline asset directory: " + relative);
            }
            var length = new FileInfo(file).Length;
            totalBytes += length;
            if (length > MaxFileBytes || totalBytes > MaxTotalBytes)
                throw new InvalidDataException("Oversized offline asset: " + relative);
            var actual = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file)))
                .ToLowerInvariant();
            if (!string.Equals(actual, expected, StringComparison.Ordinal))
                throw new InvalidDataException("Offline asset checksum mismatch: " + relative);
        }

        var requiredFiles = storyOnlyPackage
            ? new[] { "index.html", "story.html", "src/story-app.js",
                      "src/story-slice.js", "QUICK_START.txt" }
            : new[] { "index.html", "story.html", "terrain.html", "src/app.js",
                      "src/story-app.js", "src/story-slice.js",
                      "src/aden-city-explorer.js", "QUICK_START.txt" };
        foreach (var required in requiredFiles)
            if (!seen.Contains(required))
                throw new InvalidDataException("Required offline asset omitted: " + required);
        if (storyOnlyPackage)
        {
            foreach (var forbidden in new[] {
                "src/app.js", "src/br96-client.js", "src/br96-squad-panel.js",
                "terrain.html", "br96.html", "team.html"
            })
                if (seen.Contains(forbidden))
                    throw new InvalidDataException("Non-story entry in story-only package: " + forbidden);
            // The source packager creates a distinct story landing page,
            // never a second browser shortcut to the excluded battle royale.
            if (!File.ReadAllText(Path.Combine(root, "index.html"), Encoding.UTF8)
                   .Contains("Story CH01 Preview", StringComparison.Ordinal))
                throw new InvalidDataException("Invalid story-only landing page.");
            if (!File.ReadAllText(Path.Combine(root, "NOTICE.txt"), Encoding.UTF8)
                   .Contains("story-only browser preview", StringComparison.Ordinal))
                throw new InvalidDataException("Story-only release notice missing.");
        }

        if (!File.Exists(Path.Combine(root, "NOTICE.txt")))
            throw new InvalidDataException("Offline release limitation notice missing.");
        // Enumerate filesystem entries ourselves, not AllDirectories: the
        // latter can follow an unlisted Windows junction even if no manifest
        // entry references it. A junction to an EMPTY outside directory was
        // previously invisible to EnumerateFiles and passed preflight.
        var pendingDirectories = new Stack<string>();
        pendingDirectories.Push(root);
        var inspectedDirectories = 0;
        while (pendingDirectories.Count > 0)
        {
            var directory = pendingDirectories.Pop();
            if (++inspectedDirectories > MaxEntries + 1)
                throw new InvalidDataException("Too many offline asset directories.");
            foreach (var entry in Directory.EnumerateFileSystemEntries(directory))
            {
                var relative = Path.GetRelativePath(root, entry).Replace('\\', '/');
                var attributes = File.GetAttributes(entry);
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("Reparse point in offline game/: " + relative);
                if ((attributes & FileAttributes.Directory) != 0)
                {
                    if (!seen.Any(name => name.StartsWith(relative + "/", StringComparison.OrdinalIgnoreCase)))
                        throw new InvalidDataException("Untracked directory in offline game/: " + relative);
                    pendingDirectories.Push(entry);
                }
                else if (relative is not "MANIFEST.sha256" and not "NOTICE.txt" && !seen.Contains(relative))
                    throw new InvalidDataException("Untracked file in offline game/: " + relative);
            }
        }
    }
}
