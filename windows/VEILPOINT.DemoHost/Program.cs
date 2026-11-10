using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace VEILPOINT.DemoHost;

// A Windows WebView2 HOST for the existing offline BR + CH01 browser demo.
// This is not an Unreal Engine native game, nor a WebView2 runtime installer.
// All gameplay, scripts and saves remain controlled by the existing demo.
internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Windows CI can execute the actual published PE without opening a
        // GUI. Nonzero means that its bundled game assets are not loadable.
        var gameFolder = Path.Combine(AppContext.BaseDirectory, "game");
        var storyPayload = File.Exists(Path.Combine(gameFolder, "src", "story-app.js")) &&
                           !File.Exists(Path.Combine(gameFolder, "src", "app.js"));
        if (args.Length == 1 && args[0] == "--verify-package")
        {
            try
            {
                if (storyPayload) OfflinePayloadVerifier.VerifyStoryOnly(gameFolder);
                else OfflinePayloadVerifier.Verify(gameFolder);
                return 0;
            }
            catch
            {
                return 7;
            }
        }

        ApplicationConfiguration.Initialize();
        // Preserve the existing mixed-mode developer host, but allow an
        // explicitly story-only Windows launch without exposing BR navigation.
        if (storyPayload)
            Application.Run(new DemoWindow(storyOnly: true, storyPayload: true));
        else if (args.Length == 1 && args[0] == "--story-only")
            Application.Run(new DemoWindow(storyOnly: true));
        else
            Application.Run(new DemoWindow());
        return 0;
    }
}

internal sealed class DemoWindow : Form
{
    private readonly bool storyOnly;
    private readonly bool storyPayload;
    private const string VirtualHost = "veilpoint.local";
    private const string BaseUri = "https://" + VirtualHost + "/";
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly Label status = new()
    {
        Dock = DockStyle.Bottom,
        Height = 32,
        TextAlign = ContentAlignment.MiddleLeft,
        ForeColor = Color.White,
        BackColor = Color.FromArgb(27, 38, 48),
        Padding = new Padding(12, 0, 8, 0),
        Text = "Initializing offline Windows demo..."
    };
    private readonly Button battleRoyale = new()
    {
        Text = "Battle Royale", Width = 150, Height = 34, Enabled = false
    };
    private readonly Button story = new()
    {
        Text = "Story CH01", Width = 150, Height = 34, Enabled = false
    };
    // The ZIP already ships the optional terrain viewer. The Windows host
    // previously hid that real local content behind the BR/CH01-only toolbar.
    // This is the ORIGINAL synthetic preview, NOT the complete Aden map.
    private readonly Button terrainLab = new()
    {
        Text = "Original Terrain Lab", Width = 176, Height = 34, Enabled = false
    };

    public DemoWindow(bool storyOnly = false, bool storyPayload = false)
    {
        this.storyOnly = storyOnly;
        this.storyPayload = storyPayload;
        Text = storyOnly
            ? "VEILPOINT | Story CH01 offline preview (WebView2 host)"
            : "VEILPOINT | Story-first + BR prototype (WebView2 host)";
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(900, 600);
        BackColor = Color.FromArgb(19, 27, 35);

        var header = new FlowLayoutPanel
        {
            Dock = DockStyle.Top, Height = 46, WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(10, 5, 0, 0),
            BackColor = Color.FromArgb(27, 38, 48)
        };
        // CH01 is the first playable entry in the combined development demo.
        header.Controls.Add(story);
        header.Controls.Add(battleRoyale);
        header.Controls.Add(terrainLab);
        battleRoyale.Visible = !storyOnly;
        terrainLab.Visible = !storyOnly;
        Controls.Add(browser);
        Controls.Add(status);
        Controls.Add(header);
        battleRoyale.Click += (_, _) => NavigateTo("index.html");
        story.Click += (_, _) => NavigateTo("story.html");
        terrainLab.Click += (_, _) => NavigateTo("terrain.html");
        Shown += async (_, _) => await InitializeHostAsync();
    }

    private static bool IsLocalHost(Uri? uri) =>
        uri is not null &&
        uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
        uri.IdnHost.Equals(VirtualHost, StringComparison.OrdinalIgnoreCase) &&
        uri.IsDefaultPort &&
        string.IsNullOrEmpty(uri.UserInfo);

    private static bool IsAllowedPage(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (!IsLocalHost(uri)) return false;
        return uri.AbsolutePath is "/index.html" or "/story.html" or "/terrain.html";
    }

    private void NavigateTo(string page)
    {
        // Only three reviewed, manifest-verified offline pages can be top level.
        // Other local files may still be loaded as same-origin subresources.
        if (browser.CoreWebView2 is null) return;
        var destination = BaseUri + page;
        if (IsAllowedPage(destination) && (!storyOnly || page == "story.html"))
            browser.CoreWebView2.Navigate(destination);
    }

    private async Task InitializeHostAsync()
    {
        try
        {
            // Never fall back to file://, a development HTTP server, or an
            // Internet URL when the bundled game files are missing.
            var gameFolder = Path.Combine(AppContext.BaseDirectory, "game");
            // Verify the exact expected launch contract before WebView2 runs:
            // the story archive omits BR/terrain, while the mixed preview keeps it.
            if (storyPayload) OfflinePayloadVerifier.VerifyStoryOnly(gameFolder);
            else OfflinePayloadVerifier.Verify(gameFolder); // Fail closed on changed JS.

            // A stable, private virtual origin allows localStorage checkpoints
            // to survive EXE restarts. These are separate from file:// saves.
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "VEILPOINT", "DemoHost", storyOnly ? "StoryOnly" : "WebView2");
            Directory.CreateDirectory(userDataFolder);
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: userDataFolder);
            await browser.EnsureCoreWebView2Async(environment);
            var core = browser.CoreWebView2;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.SetVirtualHostNameToFolderMapping(
                VirtualHost, gameFolder, CoreWebView2HostResourceAccessKind.DenyCors);

            // A game package must not load remote HTTP(S) resources. Unlike
            // navigation-only filtering this rejects external subresources too.
            core.AddWebResourceRequestedFilter(
                "*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) =>
            {
                if (Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var requested) &&
                    (requested.Scheme is "http" or "https") &&
                    !IsLocalHost(requested))
                {
                    e.Response = core.Environment.CreateWebResourceResponse(
                        Stream.Null, 403, "External network resource blocked",
                        "Content-Type: text/plain");
                }
            };
            core.NavigationStarting += (_, e) =>
            {
                // about:blank is WebView2's own initial empty document.
                if (e.Uri.Equals("about:blank", StringComparison.OrdinalIgnoreCase) ||
                    (IsAllowedPage(e.Uri) &&
                     (!storyOnly || new Uri(e.Uri).AbsolutePath == "/story.html" ||
                      (storyPayload && new Uri(e.Uri).AbsolutePath == "/index.html")))) return;
                e.Cancel = true;
                status.Text = storyOnly
                    ? "Navigation blocked: story-only mode allows CH01 only."
                    : "Navigation blocked: only bundled BR, CH01 and original terrain pages are allowed.";
            };
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (IsAllowedPage(e.Uri) &&
                    (!storyOnly || new Uri(e.Uri).AbsolutePath == "/story.html" ||
                      (storyPayload && new Uri(e.Uri).AbsolutePath == "/index.html")))
                    core.Navigate(e.Uri);
            };
            // A BR-free story package contains its own synthetic index.html
            // landing page. Allow that local page only for this package; the
            // combined --story-only mode must still block the BR index.html.
            // Top-level NavigationStarting does not cover every iframe. The
            // restricted launch never embeds a second game mode in a frame.
            core.FrameNavigationStarting += (_, e) =>
            {
                if (storyOnly) e.Cancel = true;
            };
            core.NavigationCompleted += (_, e) =>
            {
                if (e.IsSuccess)
                    status.Text = storyOnly
                        ? "OFFLINE | CH01 story-only launch | ESC: pause | Local story save"
                        : "OFFLINE | Story-first WebView2 demo | ESC: pause | Local story / BR saves";
                else
                    status.Text = "The offline page did not load. Verify game/ assets and WebView2 runtime.";
            };

            story.Enabled = true;
            battleRoyale.Enabled = !storyOnly;
            terrainLab.Enabled = !storyOnly;
            NavigateTo("story.html");
        }
        catch (Exception ex)
        {
            status.Text = "Windows demo host could not start. No game session was launched.";
            MessageBox.Show(
                "The Windows EXE needs the Microsoft Edge WebView2 runtime " +
                "(preinstalled on most Windows 11 PCs) and all game/ files.\n\n" +
                ex.Message + "\n\nNo UE5 executable or real-device FPS was verified.",
                "VEILPOINT offline host startup failed",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}
