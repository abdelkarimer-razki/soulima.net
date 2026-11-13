/**
 * Soulima PS4 Native Application — main.cpp
 *
 * True native 1080p OrbisOS application rendering directly to the PS4 display
 * buffers via libSceVideoOut and controlled via DualShock 4 (libScePad).
 */

#include "renderer.h"
#include "controller.h"
#include "network.h"
#include <stdio.h>
#include <string.h>

extern "C" {
    int32_t sceSystemServiceHideSplashScreen(void);
    int32_t sceSystemServiceLaunchWebBrowser(const char *url, void *param);
}

enum class ActiveFocus {
    Actions,
    IpEditor
};

struct LogEntry {
    char text[96];
};

static LogEntry logEntries[5];
static int logCount = 0;

static void AddLog(const char *msg) {
    if (logCount < 5) {
        strncpy(logEntries[logCount].text, msg, sizeof(logEntries[logCount].text) - 1);
        logCount++;
    } else {
        for (int i = 0; i < 4; i++) {
            strcpy(logEntries[i].text, logEntries[i+1].text);
        }
        strncpy(logEntries[4].text, msg, sizeof(logEntries[4].text) - 1);
    }
}

int main(void)
{
    // Dismiss the firmware loading splash screen
    sceSystemServiceHideSplashScreen();

    Renderer renderer;
    if (!renderer.Init()) {
        return 1;
    }

    Controller controller;
    if (!controller.Init()) {
        return 1;
    }

    NetworkManager network;
    network.LoadConfig();

    AddLog("[INIT] Native VideoOut 1080p 60Hz Engine Initialized");
    AddLog("[INIT] DualShock 4 Controller Bound (User 0)");
    char initMsg[96];
    snprintf(initMsg, sizeof(initMsg), "[NET] Loaded Target Node: %s", network.GetUrl());
    AddLog(initMsg);

    // Initial connection check
    network.TestConnection();
    if (network.status == ServerStatus::Online) {
        AddLog("[STATUS] Streaming Server Online & Ready");
    } else {
        AddLog("[STATUS] Server Unreachable. Start server on PC.");
    }

    ActiveFocus focus = ActiveFocus::Actions;
    int selectedAction = 0;
    const int actionCount = 4;
    int selectedOctet = 3; // Focus on last octet (68)

    int frameCounter = 0;
    bool shouldQuit = false;

    while (!shouldQuit) {
        frameCounter++;
        controller.Update();

        // Global hotkeys
        if (controller.Circle()) {
            shouldQuit = true;
            break;
        }

        if (controller.Square()) {
            network.TestConnection();
            char pingMsg[96];
            if (network.status == ServerStatus::Online) {
                snprintf(pingMsg, sizeof(pingMsg), "[PING] Online (%d ms) -> Server Ready", network.lastLatencyMs);
            } else {
                snprintf(pingMsg, sizeof(pingMsg), "[PING] Failed: %s", network.statusMessage);
            }
            AddLog(pingMsg);
        }

        if (controller.Triangle()) {
            if (network.SaveConfig()) {
                AddLog("[CONF] Configuration saved to /data/soulima.conf");
            } else {
                AddLog("[CONF] Saved in memory (filesystem write restricted)");
            }
        }

        if (controller.L1() || controller.R1()) {
            focus = (focus == ActiveFocus::Actions) ? ActiveFocus::IpEditor : ActiveFocus::Actions;
        }

        // Focus navigation
        if (focus == ActiveFocus::Actions) {
            if (controller.Up()) {
                selectedAction = (selectedAction - 1 + actionCount) % actionCount;
            }
            if (controller.Down()) {
                selectedAction = (selectedAction + 1) % actionCount;
            }
            if (controller.Right()) {
                focus = ActiveFocus::IpEditor;
            }

            if (controller.Cross()) {
                switch (selectedAction) {
                    case 0: { // Launch Cinema Stream Player
                        char urlBuf[128];
                        snprintf(urlBuf, sizeof(urlBuf), "%s", network.GetUrl());
                        AddLog("[STREAM] Launching Soulima Fullscreen Cinema Experience...");
                        renderer.Clear(Color::Bg());
                        renderer.DrawTextCentered("Connecting to Soulima Cinema Stream...", 960, 520, 2, Color::Gold());
                        renderer.DrawTextCentered(urlBuf, 960, 570, 1, Color::Cyan());
                        renderer.Flip();
                        sceSystemServiceLaunchWebBrowser(urlBuf, nullptr);
                        break;
                    }
                    case 1: { // Test Connection
                        network.TestConnection();
                        char pingMsg[96];
                        if (network.status == ServerStatus::Online) {
                            snprintf(pingMsg, sizeof(pingMsg), "[PING] Online! Latency: %d ms", network.lastLatencyMs);
                        } else {
                            snprintf(pingMsg, sizeof(pingMsg), "[PING] Connection refused. Check PC server.");
                        }
                        AddLog(pingMsg);
                        break;
                    }
                    case 2: { // Reset IP to 192.168.1.68
                        network.InitDefault(192, 168, 1, 68, 3030);
                        AddLog("[CONF] Reset target IP to 192.168.1.68:3030");
                        network.TestConnection();
                        break;
                    }
                    case 3: { // Diagnostics
                        AddLog("[DIAG] Framebuffer: 1920x1080 32bpp | Mem: 32MB direct");
                        break;
                    }
                }
            }
        } else if (focus == ActiveFocus::IpEditor) {
            if (controller.Left()) {
                if (selectedOctet > 0) {
                    selectedOctet--;
                } else {
                    focus = ActiveFocus::Actions;
                }
            }
            if (controller.Right()) {
                if (selectedOctet < 3) {
                    selectedOctet++;
                }
            }
            if (controller.Up()) {
                network.ip[selectedOctet] = (network.ip[selectedOctet] + 1) % 256;
            }
            if (controller.Down()) {
                network.ip[selectedOctet] = (network.ip[selectedOctet] - 1 + 256) % 256;
            }
            if (controller.Cross()) {
                focus = ActiveFocus::Actions;
            }
        }

        // ==============================================================
        // RENDER PASS (1080p, 60fps)
        // ==============================================================
        renderer.Clear(Color::Bg());

        // Top Navigation Bar
        renderer.DrawRect(0, 0, 1920, 80, Color(18, 20, 27));
        renderer.DrawHLine(0, 80, 1920, Color::Gold());

        renderer.DrawText("SOULIMA CINEMA", 60, 24, 2, Color::Gold());
        renderer.DrawBadge("NATIVE PS4 ORBIS v1.00", 380, 26, Color::White(), Color::Crimson());
        renderer.DrawText("Pure Torrent Cinema • DualShock 4 Controller Enabled", 60, 56, 1, Color::Gray());

        renderer.DrawText("Firmware: GoldHEN 5.05 - 11.00+", 1450, 24, 1, Color::Cyan());
        renderer.DrawText("Display: 1920x1080 @ 60Hz", 1450, 48, 1, Color::Gray());

        // Left Column (Cards 1, 2, 3)
        // Card 1: Server Status
        renderer.DrawCard(60, 110, 880, 210, "STREAMING SERVER NODE");
        renderer.DrawText("Server URL:", 90, 160, 1, Color::Gray());
        renderer.DrawText(network.GetUrl(), 210, 156, 2, Color::White());

        renderer.DrawText("Status:", 90, 210, 1, Color::Gray());
        if (network.status == ServerStatus::Online) {
            char latBuf[32];
            snprintf(latBuf, sizeof(latBuf), "ONLINE (%d ms)", network.lastLatencyMs);
            renderer.DrawBadge(latBuf, 210, 204, Color::White(), Color::Green());
        } else if (network.status == ServerStatus::Checking) {
            renderer.DrawBadge("CHECKING...", 210, 204, Color::White(), Color::Gold());
        } else {
            renderer.DrawBadge("OFFLINE / UNREACHABLE", 210, 204, Color::White(), Color::Crimson());
        }

        renderer.DrawText(network.statusMessage, 90, 255, 1, network.status == ServerStatus::Online ? Color::Green() : Color::Gray());
        renderer.DrawText("Engine: Node.js + WebTorrent with Seekable HTTP 206 Loopback", 90, 280, 1, Color::DarkGray());

        // Card 2: Interactive IP Editor
        Color ipBorder = (focus == ActiveFocus::IpEditor) ? Color::Gold() : Color::PanelBorder();
        renderer.DrawCard(60, 340, 880, 240, "TARGET SERVER IP CONFIGURATION", ipBorder);
        renderer.DrawText("Adjust target PC server IP address using DualShock 4 Controller:", 90, 390, 1, Color::Gray());

        // Draw 4 Octets
        int octetX = 90;
        int octetY = 430;
        for (int i = 0; i < 4; i++) {
            bool isCurrent = (focus == ActiveFocus::IpEditor && selectedOctet == i);
            Color boxBg = isCurrent ? Color(40, 48, 68) : Color(26, 30, 40);
            Color boxBorder = isCurrent ? Color::Gold() : Color::PanelBorder();
            Color txtColor = isCurrent ? Color::Gold() : Color::White();

            renderer.DrawRect(octetX, octetY, 110, 60, boxBg);
            renderer.DrawOutlineRect(octetX, octetY, 110, 60, isCurrent ? 3 : 1, boxBorder);

            char valBuf[16];
            snprintf(valBuf, sizeof(valBuf), "%d", network.ip[i]);
            renderer.DrawTextCentered(valBuf, octetX + 55, octetY + 18, 2, txtColor);

            if (i < 3) {
                renderer.DrawText(".", octetX + 118, octetY + 18, 2, Color::Gray());
                octetX += 140;
            } else {
                octetX += 120;
            }
        }

        renderer.DrawText(": 3030", octetX + 10, octetY + 18, 2, Color::Cyan());
        renderer.DrawText("[D-Pad Left/Right] Select Octet     [D-Pad Up/Down] Increment/Decrement", 90, 515, 1, Color::Cyan());
        renderer.DrawText("[Square] Test Ping Connection       [Triangle] Save to /data/soulima.conf", 90, 540, 1, Color::Gold());

        // Card 3: Live Diagnostics Terminal
        renderer.DrawCard(60, 600, 880, 370, "LIVE SYSTEM & NETWORK LOG");
        for (int i = 0; i < logCount; i++) {
            Color logColor = Color::White();
            if (strstr(logEntries[i].text, "Online") || strstr(logEntries[i].text, "Ready")) {
                logColor = Color::Green();
            } else if (strstr(logEntries[i].text, "Failed") || strstr(logEntries[i].text, "Unreachable")) {
                logColor = Color::Crimson();
            } else if (strstr(logEntries[i].text, "CONF")) {
                logColor = Color::Gold();
            } else if (strstr(logEntries[i].text, "INIT")) {
                logColor = Color::Cyan();
            }
            renderer.DrawText(logEntries[i].text, 90, 650 + (i * 32), 1, logColor);
        }

        // Right Column (Cards 4, 5)
        // Card 4: Operations & Action Deck
        Color actBorder = (focus == ActiveFocus::Actions) ? Color::Gold() : Color::PanelBorder();
        renderer.DrawCard(980, 110, 880, 470, "OPERATIONS & STREAMING ACTIONS", actBorder);

        const char *actionTitles[] = {
            "[1] Launch Cinema Experience (Fullscreen Stream)",
            "[2] Test & Ping Streaming Engine Connection",
            "[3] Reset Target IP to 192.168.1.68",
            "[4] View Hardware Diagnostics & Memory Info"
        };
        const char *actionDescs[] = {
            "Launches Soulima Cinema interface connected to your PC server.",
            "Sends TCP handshake to port 3030 and measures round-trip latency.",
            "Restores target IP to active local development host (192.168.1.68).",
            "Displays PS4 direct video memory mapping and OrbisOS subsystem stats."
        };

        for (int i = 0; i < actionCount; i++) {
            bool isSelected = (focus == ActiveFocus::Actions && selectedAction == i);
            int itemY = 165 + (i * 95);

            Color btnBg = isSelected ? Color(35, 42, 60) : Color(24, 27, 36);
            Color btnBorder = isSelected ? Color::Gold() : Color::PanelBorder();
            Color btnTxt = isSelected ? Color::Gold() : Color::White();

            renderer.DrawRect(1010, itemY, 820, 80, btnBg);
            renderer.DrawOutlineRect(1010, itemY, 820, 80, isSelected ? 2 : 1, btnBorder);

            if (isSelected) {
                renderer.DrawText(">", 1025, itemY + 16, 2, Color::Gold());
            }
            renderer.DrawText(actionTitles[i], 1055, itemY + 14, 1, btnTxt);
            renderer.DrawText(actionDescs[i], 1055, itemY + 44, 1, Color::Gray());
        }

        // Card 5: Specifications & Technology Stack
        renderer.DrawCard(980, 600, 880, 370, "STREAMING STACK ARCHITECTURE");
        renderer.DrawText("Architecture Overview:", 1010, 650, 1, Color::Gold());
        renderer.DrawText("- Host Engine:    Node.js Express + WebTorrent Torrent Streamer", 1010, 680, 1, Color::White());
        renderer.DrawText("- Seeking Bridge: HTTP 206 Partial Content Range Support", 1010, 710, 1, Color::White());
        renderer.DrawText("- Transcoding:    Fast FFmpeg remux with -ss keyframe seek", 1010, 740, 1, Color::White());
        renderer.DrawText("- PS4 Client:     Native OrbisOS C++ Executable (FSELF)", 1010, 770, 1, Color::White());
        renderer.DrawText("- Display Output: libSceVideoOut (1920x1080 32-bit Framebuffer)", 1010, 800, 1, Color::White());
        renderer.DrawText("- Controller:     libScePad (DualShock 4 Wireless / USB)", 1010, 830, 1, Color::White());
        renderer.DrawText("- Porting SDK:    OpenOrbis PS4 Toolchain (Clang/LLVM 18)", 1010, 860, 1, Color::White());
        renderer.DrawText("- Compatibility:  Jailbroken PS4 (Firmware 5.05 through 11.00+)", 1010, 890, 1, Color::Cyan());

        // Bottom Footer Bar
        renderer.DrawRect(0, 1000, 1920, 80, Color(16, 18, 24));
        renderer.DrawHLine(0, 1000, 1920, Color::PanelBorder());

        renderer.DrawBadge("(X) Execute Action", 80, 1020, Color::White(), Color(35, 42, 60));
        renderer.DrawBadge("(Square) Ping Server", 320, 1020, Color::White(), Color(35, 42, 60));
        renderer.DrawBadge("(Triangle) Save Config", 570, 1020, Color::White(), Color(35, 42, 60));
        renderer.DrawBadge("(L1 / R1) Switch Section", 830, 1020, Color::White(), Color(35, 42, 60));
        renderer.DrawBadge("(D-Pad) Navigate / Edit", 1120, 1020, Color::White(), Color(35, 42, 60));
        renderer.DrawBadge("(O) Exit Application", 1400, 1020, Color::White(), Color(35, 42, 60));

        renderer.Flip();
    }

    return 0;
}
