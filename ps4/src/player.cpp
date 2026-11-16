#include "player.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>

CinemaPlayer::CinemaPlayer()
    : state(PlayerState::Stopped), currentDurationSec(7500), currentPositionSec(0),
      bufferPercent(0), seeds(0), peers(0), speedKb(0), frameCounter(0),
      hudTimer(300), hudVisible(true)
{
    memset(currentTitle, 0, sizeof(currentTitle));
    memset(currentQuality, 0, sizeof(currentQuality));
    memset(currentStreamId, 0, sizeof(currentStreamId));
    memset(currentStreamUrl, 0, sizeof(currentStreamUrl));
    memset(currentMagnet, 0, sizeof(currentMagnet));

#ifdef SOULIMA_HOST
    videoPipe = nullptr;
    pipeWidth = 1280;
    pipeHeight = 720;
    frameRgbaBuffer = new uint8_t[pipeWidth * pipeHeight * 4];
    currentFrameTex = new Texture();
    currentFrameTex->width = pipeWidth;
    currentFrameTex->height = pipeHeight;
    currentFrameTex->pixels = new uint32_t[pipeWidth * pipeHeight];
    memset(currentFrameTex->pixels, 0, pipeWidth * pipeHeight * sizeof(uint32_t));
#else
    avPlayerHandle = -1;
#endif
}

CinemaPlayer::~CinemaPlayer()
{
    Stop();
#ifdef SOULIMA_HOST
    if (frameRgbaBuffer) {
        delete[] frameRgbaBuffer;
        frameRgbaBuffer = nullptr;
    }
    if (currentFrameTex) {
        delete currentFrameTex;
        currentFrameTex = nullptr;
    }
#endif
}

void CinemaPlayer::StartVideoDecoder(int startSec)
{
#ifdef SOULIMA_HOST
    StopVideoDecoder();

    if (currentStreamUrl[0]) {
        char cmd[1024];
        snprintf(cmd, sizeof(cmd),
            "ffmpeg -hide_banner -loglevel quiet -ss %d -i \"%s\" -f rawvideo -pix_fmt rgba -s %dx%d -r 24 pipe:1 2>/dev/null",
            startSec, currentStreamUrl, pipeWidth, pipeHeight);

        videoPipe = popen(cmd, "r");
        if (videoPipe) {
            // Set non-blocking read so renderer doesn't stall if stream is buffering
            int fd = fileno(videoPipe);
            int flags = fcntl(fd, F_GETFL, 0);
            fcntl(fd, F_SETFL, flags | O_NONBLOCK);
        }

        // Spawn synchronized audio through VLC in background
        char audioCmd[512];
        snprintf(audioCmd, sizeof(audioCmd),
            "cvlc --intf dummy --no-video --start-time %d \"%s\" >/dev/null 2>&1 &",
            startSec, currentStreamUrl);
        system(audioCmd);
    }
#else
    // PS4 native AvPlayer initialization
    // sceAvPlayerInit, sceAvPlayerAddSource(streamUrl)
#endif
}

void CinemaPlayer::StopVideoDecoder()
{
#ifdef SOULIMA_HOST
    if (videoPipe) {
        pclose(videoPipe);
        videoPipe = nullptr;
    }
    system("killall -9 vlc 2>/dev/null");
#else
    // sceAvPlayerStop, sceAvPlayerClose
#endif
}

void CinemaPlayer::Start(const char *title, const char *quality, const char *magnet, NetworkManager *net)
{
    Stop();

    strncpy(currentTitle, title ? title : "Cinema Stream", sizeof(currentTitle) - 1);
    strncpy(currentQuality, quality ? quality : "1080p", sizeof(currentQuality) - 1);
    if (magnet) {
        strncpy(currentMagnet, magnet, sizeof(currentMagnet) - 1);
    }

    currentDurationSec = 7500;
    currentPositionSec = 0;
    bufferPercent = 5;
    seeds = 0;
    peers = 0;
    speedKb = 0;
    frameCounter = 0;
    hudTimer = 300;
    hudVisible = true;
    state = PlayerState::ConnectingSwarm;

    // If magnet is empty, search backend for best torrent
    if ((!currentMagnet[0] || strncmp(currentMagnet, "magnet:?", 8) != 0) && net) {
        char resolvedMagnet[512];
        if (net->SearchTorrent(currentTitle, resolvedMagnet, sizeof(resolvedMagnet))) {
            strncpy(currentMagnet, resolvedMagnet, sizeof(currentMagnet) - 1);
        }
    }

    // Call /api/stream to initialize the P2P stream
    if (net && currentMagnet[0]) {
        char streamId[64];
        if (net->StartStream(currentMagnet, streamId, sizeof(streamId))) {
            strncpy(currentStreamId, streamId, sizeof(currentStreamId) - 1);
            snprintf(currentStreamUrl, sizeof(currentStreamUrl), "%s/api/stream/%s", net->GetUrl(), currentStreamId);
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

    // Poll stream metrics every 45 frames
    if (net && currentStreamId[0] && (frameCounter % 45 == 0)) {
        net->GetStreamStatus(currentStreamId, &bufferPercent, &seeds, &peers, &speedKb);
    }

    if (state == PlayerState::ConnectingSwarm) {
        if (currentStreamId[0] || frameCounter > 60) {
            state = PlayerState::Buffering;
        }
    } else if (state == PlayerState::Buffering) {
        // Buffer up to ready threshold or after ~3 seconds
        if (bufferPercent >= 15 || frameCounter > 180) {
            state = PlayerState::Playing;
            StartVideoDecoder(currentPositionSec);
        }
    } else if (state == PlayerState::Playing) {
#ifdef SOULIMA_HOST
        // Read decoded video frame from pipe
        if (videoPipe && frameRgbaBuffer && currentFrameTex) {
            size_t frameBytes = pipeWidth * pipeHeight * 4;
            size_t nRead = fread(frameRgbaBuffer, 1, frameBytes, videoPipe);
            if (nRead == frameBytes) {
                // Convert RGBA to ARGB
                for (int i = 0; i < pipeWidth * pipeHeight; i++) {
                    uint8_t r = frameRgbaBuffer[i * 4 + 0];
                    uint8_t g = frameRgbaBuffer[i * 4 + 1];
                    uint8_t b = frameRgbaBuffer[i * 4 + 2];
                    currentFrameTex->pixels[i] = (0xFF << 24) | (r << 16) | (g << 8) | b;
                }
            }
        }
#endif
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
    hudVisible = true;
    hudTimer = 240;

    if (state == PlayerState::Playing) {
        state = PlayerState::Paused;
#ifdef SOULIMA_HOST
        system("killall -STOP vlc 2>/dev/null");
#endif
    } else if (state == PlayerState::Paused) {
        state = PlayerState::Playing;
#ifdef SOULIMA_HOST
        system("killall -CONT vlc 2>/dev/null");
#endif
    }
}

void CinemaPlayer::SeekRelative(int seconds, NetworkManager *net)
{
    hudVisible = true;
    hudTimer = 300;

    currentPositionSec += seconds;
    if (currentPositionSec < 0) currentPositionSec = 0;
    if (currentPositionSec > currentDurationSec) currentPositionSec = currentDurationSec;

    // Restart video decoder with updated timestamp
    if (state == PlayerState::Playing || state == PlayerState::Paused) {
        StartVideoDecoder(currentPositionSec);
    }
}

void CinemaPlayer::Stop()
{
    StopVideoDecoder();
    state = PlayerState::Stopped;
    memset(currentStreamId, 0, sizeof(currentStreamId));
    memset(currentStreamUrl, 0, sizeof(currentStreamUrl));
}

void CinemaPlayer::Render(Renderer *renderer)
{
    if (state == PlayerState::Stopped || !renderer) return;

#ifdef SOULIMA_HOST
    // Render moving video frame if texture is active
    if (state == PlayerState::Playing && currentFrameTex && currentFrameTex->pixels) {
        renderer->DrawTexture(currentFrameTex, 0, 0, 1920, 1080);
    } else {
        renderer->Clear(Color::Bg());
    }
#else
    renderer->Clear(Color::Bg());
#endif

    // If Buffering or Connecting, show elegant center loading HUD
    if (state == PlayerState::ConnectingSwarm || state == PlayerState::Buffering) {
        renderer->DrawRect(560, 400, 800, 260, Color(18, 20, 28));
        renderer->DrawOutlineRect(560, 400, 800, 260, 2, Color::Gold());

        renderer->DrawTextCentered(currentTitle, 960, 430, 2, Color::White());

        const char *stateStr = (state == PlayerState::ConnectingSwarm) ? "Connecting to P2P Swarm..." : "Buffering BitTorrent Stream...";
        renderer->DrawTextCentered(stateStr, 960, 480, 1, Color::Gold());

        renderer->DrawProgressBar(620, 520, 680, 16, (float)bufferPercent / 100.0f, Color::Gold(), Color(30, 36, 50));

        char stats[128];
        snprintf(stats, sizeof(stats), "Buffer: %d%%  •  Seeds: %d  •  Peers: %d  •  %d KB/s",
                 bufferPercent, seeds, peers, speedKb);
        renderer->DrawTextCentered(stats, 960, 560, 1, Color::Gray());

        renderer->DrawTextCentered("Press [Circle] to Cancel", 960, 610, 1, Color::DarkGray());
    }

    // Overlay HUD during playback or pause
    if (hudVisible) {
        // Top HUD Header
        renderer->DrawGradientV(0, 0, 1920, 120, Color(0, 0, 0, 220), Color(0, 0, 0, 0));
        renderer->DrawText(currentTitle, 60, 30, 2, Color::White());

        char qualBuf[32];
        snprintf(qualBuf, sizeof(qualBuf), "HD P2P • %s", currentQuality);
        renderer->DrawBadge(qualBuf, 60, 75, Color::Gold(), Color(30, 34, 46));

        char liveBuf[64];
        snprintf(liveBuf, sizeof(liveBuf), "Seeds: %d  |  Peers: %d  |  %d KB/s", seeds, peers, speedKb);
        renderer->DrawText(liveBuf, 1400, 40, 1, Color::Gray());

        // Bottom HUD Timeline
        renderer->DrawGradientV(0, 920, 1920, 160, Color(0, 0, 0, 0), Color(0, 0, 0, 240));

        // Time strings
        int curM = currentPositionSec / 60;
        int curS = currentPositionSec % 60;
        int totM = currentDurationSec / 60;
        int totS = currentDurationSec % 60;
        char timeBuf[64];
        snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d / %02d:%02d", curM, curS, totM, totS);
        renderer->DrawText(timeBuf, 60, 970, 1, Color::White());

        // Progress scrub bar
        float p = (currentDurationSec > 0) ? ((float)currentPositionSec / (float)currentDurationSec) : 0.0f;
        renderer->DrawProgressBar(240, 974, 1440, 10, p, Color::Gold(), Color(50, 56, 70));

        if (state == PlayerState::Paused) {
            renderer->DrawBadge("PAUSED", 1720, 965, Color::White(), Color::Crimson());
        } else {
            renderer->DrawBadge("PLAYING", 1720, 965, Color::White(), Color(20, 120, 40));
        }

        // Controls footer prompt
        renderer->DrawTextCentered("[X] Play/Pause    [L1/R1] Seek -/+15s    [Square] Quality    [Circle] Exit to Cinema", 960, 1030, 1, Color::Gray());
    }
}
