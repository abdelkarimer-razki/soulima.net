#include "player.h"
#include <stdio.h>
#include <string.h>

CinemaPlayer::CinemaPlayer()
    : state(PlayerState::Stopped), currentDurationSec(7200), currentPositionSec(0),
      bufferPercent(0), seeds(0), peers(0), speedKb(0), frameCounter(0),
      hudTimer(300), hudVisible(true)
{
    memset(currentTitle, 0, sizeof(currentTitle));
    memset(currentQuality, 0, sizeof(currentQuality));
    memset(currentStreamId, 0, sizeof(currentStreamId));
}

void CinemaPlayer::Start(const char *title, const char *quality, const char *magnet, NetworkManager *net)
{
    strncpy(currentTitle, title ? title : "Cinema Stream", sizeof(currentTitle) - 1);
    strncpy(currentQuality, quality ? quality : "1080p", sizeof(currentQuality) - 1);
    memset(currentStreamId, 0, sizeof(currentStreamId));

    currentDurationSec = 7500; // ~2h 05m default
    currentPositionSec = 0;
    bufferPercent = 5;
    seeds = 85;
    peers = 24;
    speedKb = 3400;
    frameCounter = 0;
    hudTimer = 300;
    hudVisible = true;
    state = PlayerState::ConnectingSwarm;

    // Contact backend to start torrent stream
    if (net) {
        char streamId[64];
        if (net->StartStream(magnet, streamId, sizeof(streamId))) {
            strncpy(currentStreamId, streamId, sizeof(currentStreamId) - 1);
        }
    }
}

void CinemaPlayer::Update(NetworkManager *net)
{
    if (state == PlayerState::Stopped) return;
    frameCounter++;

    if (hudTimer > 0) {
        hudTimer--;
        if (hudTimer == 0) {
            hudVisible = false;
        }
    }

    if (state == PlayerState::ConnectingSwarm) {
        // After ~1.5 seconds (90 frames), switch to buffering
        if (frameCounter > 90) {
            state = PlayerState::Buffering;
        }
    } else if (state == PlayerState::Buffering) {
        bufferPercent += 2;
        if (bufferPercent >= 100) {
            bufferPercent = 100;
            state = PlayerState::Playing;
        }

        // Poll real stream status every 60 frames if streamId is valid
        if (net && currentStreamId[0] && (frameCounter % 60 == 0)) {
            net->GetStreamStatus(currentStreamId, &bufferPercent, &seeds, &peers, &speedKb);
        }
    } else if (state == PlayerState::Playing) {
        // Advance position every 60 frames (1 second)
        if (frameCounter % 60 == 0) {
            currentPositionSec++;
            if (currentPositionSec >= currentDurationSec) {
                currentPositionSec = currentDurationSec;
                state = PlayerState::Paused;
            }
        }
    }
}

void CinemaPlayer::TogglePlayPause()
{
    if (state == PlayerState::Playing) {
        state = PlayerState::Paused;
        hudVisible = true;
        hudTimer = 600;
    } else if (state == PlayerState::Paused) {
        state = PlayerState::Playing;
        hudVisible = true;
        hudTimer = 240;
    }
}

void CinemaPlayer::SeekRelative(int seconds)
{
    if (state != PlayerState::Playing && state != PlayerState::Paused) return;

    currentPositionSec += seconds;
    if (currentPositionSec < 0) currentPositionSec = 0;
    if (currentPositionSec > currentDurationSec) currentPositionSec = currentDurationSec;

    hudVisible = true;
    hudTimer = 300;
}

void CinemaPlayer::Stop()
{
    state = PlayerState::Stopped;
}

void CinemaPlayer::Render(Renderer *renderer)
{
    if (state == PlayerState::Stopped || !renderer) return;

    // Cinema Screen Background
    renderer->Clear(Color(5, 6, 9));

    // Cinema 2.39:1 Aspect Ratio Letterbox Bars
    renderer->DrawRect(0, 0, 1920, 90, Color(0, 0, 0));
    renderer->DrawRect(0, 990, 1920, 90, Color(0, 0, 0));

    if (state == PlayerState::ConnectingSwarm || state == PlayerState::Buffering) {
        // Central Loading Modal
        int modalW = 860;
        int modalH = 420;
        int modalX = (1920 - modalW) / 2;
        int modalY = (1080 - modalH) / 2;

        renderer->DrawGradientV(modalX, modalY, modalW, modalH, Color(24, 28, 40), Color(14, 16, 24));
        renderer->DrawOutlineRect(modalX, modalY, modalW, modalH, 2, Color::Gold());

        // Header
        renderer->DrawTextCentered("SOULIMA PURE TORRENT STREAMING ENGINE", modalX + (modalW / 2), modalY + 30, 2, Color::Gold());
        renderer->DrawHLine(modalX, modalY + 70, modalW, Color::PanelBorder());

        // Title and Quality
        renderer->DrawTextCentered(currentTitle, modalX + (modalW / 2), modalY + 105, 2, Color::White());
        renderer->DrawBadge(currentQuality, modalX + (modalW / 2) - 45, modalY + 150, Color::White(), Color::Crimson());

        // Status text
        if (state == PlayerState::ConnectingSwarm) {
            renderer->DrawTextCentered("Connecting to BitTorrent Swarm...", modalX + (modalW / 2), modalY + 215, 1, Color::Cyan());
            renderer->DrawTextCentered("Announcing to 20+ DHT Trackers & Initializing Peer Connections", modalX + (modalW / 2), modalY + 245, 1, Color::Gray());

            // Animated pulsing bar
            int pulse = (frameCounter % 60) * 14;
            renderer->DrawRect(modalX + 130 + pulse, modalY + 280, 80, 8, Color::Gold());
            renderer->DrawOutlineRect(modalX + 130, modalY + 280, 600, 8, 1, Color::PanelBorder());
        } else {
            renderer->DrawTextCentered("Buffering Initial Fragmented MP4 Chunks...", modalX + (modalW / 2), modalY + 210, 1, Color::Green());

            char prgBuf[64];
            snprintf(prgBuf, sizeof(prgBuf), "Buffer Progress: %d%%", bufferPercent);
            renderer->DrawTextCentered(prgBuf, modalX + (modalW / 2), modalY + 240, 1, Color::Gold());

            renderer->DrawProgressBar(modalX + 130, modalY + 270, 600, 14, (float)bufferPercent / 100.0f, Color::Gold(), Color(30, 35, 48));

            char statBuf[128];
            snprintf(statBuf, sizeof(statBuf), "Active Seeds: %d  |  Peers: %d  |  Download Speed: %d KB/s", seeds, peers, speedKb);
            renderer->DrawTextCentered(statBuf, modalX + (modalW / 2), modalY + 310, 1, Color::Cyan());
        }

        renderer->DrawTextCentered("Press (O) Circle to Cancel & Return to Movie Wall", modalX + (modalW / 2), modalY + 365, 1, Color::DarkGray());
        return;
    }

    // ==============================================================
    // PLAYING / PAUSED STATE
    // ==============================================================
    // Simulated Film Frame (Dynamic Gradient Ambience)
    int vidX = 80;
    int vidY = 120;
    int vidW = 1760;
    int vidH = 840;

    int animShift = (currentPositionSec % 10) * 2;
    renderer->DrawGradientV(vidX, vidY, vidW, vidH, Color(16 + animShift, 20 + animShift, 32), Color(8, 10, 16));
    renderer->DrawOutlineRect(vidX, vidY, vidW, vidH, 1, Color(30, 36, 50));

    // Centered Cinema Watermark
    renderer->DrawTextCentered("SOULIMA CINEMA", 960, 480, 3, Color(30, 35, 48));
    renderer->DrawTextCentered("1080p 60Hz Hardware Acceleration Active", 960, 530, 1, Color(45, 55, 75));

    if (state == PlayerState::Paused) {
        renderer->DrawBadge("PAUSED", 910, 400, Color::White(), Color::GoldDim());
    }

    // HUD OVERLAY (when visible)
    if (hudVisible || state == PlayerState::Paused) {
        // Top HUD Bar
        renderer->DrawRect(0, 0, 1920, 80, Color(12, 14, 20));
        renderer->DrawHLine(0, 80, 1920, Color::Gold());

        renderer->DrawText(currentTitle, 60, 24, 2, Color::Gold());
        renderer->DrawBadge(currentQuality, 560, 26, Color::White(), Color::Crimson());
        renderer->DrawBadge("PURE TORRENT REMUX", 680, 26, Color::White(), Color::Panel());

        char statLine[64];
        snprintf(statLine, sizeof(statLine), "Seeds: %d | Bitrate: %d KB/s", seeds, speedKb);
        renderer->DrawText(statLine, 1480, 28, 1, Color::Green());

        // Bottom HUD Bar
        renderer->DrawRect(0, 920, 1920, 160, Color(12, 14, 20));
        renderer->DrawHLine(0, 920, 1920, Color::PanelBorder());

        // Timeline Progress Bar
        float progress = (currentDurationSec > 0) ? (float)currentPositionSec / (float)currentDurationSec : 0.0f;
        renderer->DrawProgressBar(80, 950, 1760, 10, progress, Color::Gold(), Color(35, 40, 55));

        // Timestamps
        int curH = currentPositionSec / 3600;
        int curM = (currentPositionSec % 3600) / 60;
        int curS = currentPositionSec % 60;

        int durH = currentDurationSec / 3600;
        int durM = (currentDurationSec % 3600) / 60;
        int durS = currentDurationSec % 60;

        char timeBuf[64];
        snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d / %02d:%02d:%02d", curH, curM, curS, durH, durM, durS);
        renderer->DrawText(timeBuf, 80, 975, 1, Color::White());

        // Controls Legend
        renderer->DrawBadge("(X) Play / Pause", 700, 995, Color::White(), Color(28, 34, 48));
        renderer->DrawBadge("(Left / L1) -15s", 930, 995, Color::White(), Color(28, 34, 48));
        renderer->DrawBadge("(Right / R1) +15s", 1140, 995, Color::White(), Color(28, 34, 48));
        renderer->DrawBadge("(O) Exit Cinema", 1370, 995, Color::White(), Color(28, 34, 48));
    }
}
