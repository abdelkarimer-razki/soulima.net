#include "renderer.h"
#include "font8x16.h"
#include <string.h>
#include <stdio.h>

Renderer::Renderer()
    : videoHandle(-1), directMemOff(0), directMemSize(0), videoMem(nullptr),
      videoMemSP(0), activeBufferIdx(0), frameId(0)
{
    memset(frameBuffers, 0, sizeof(frameBuffers));
}

Renderer::~Renderer()
{
    if (directMemOff && directMemSize) {
        sceKernelReleaseDirectMemory(directMemOff, directMemSize);
    }
}

bool Renderer::initFlipQueue()
{
    int rc = sceKernelCreateEqueue(&flipQueue, "soulima_flip_q");
    if (rc < 0) return false;
    sceVideoOutAddFlipEvent(flipQueue, videoHandle, nullptr);
    return true;
}

bool Renderer::allocateVideoMemory(size_t size, int alignment)
{
    directMemSize = (size + alignment - 1) / alignment * alignment;
    int rc = sceKernelAllocateDirectMemory(0, sceKernelGetDirectMemorySize(), directMemSize, alignment, 3, &directMemOff);
    if (rc < 0) return false;

    rc = sceKernelMapDirectMemory(&videoMem, directMemSize, 0x33, 0, directMemOff, alignment);
    if (rc < 0) {
        sceKernelReleaseDirectMemory(directMemOff, directMemSize);
        return false;
    }
    videoMemSP = (uintptr_t)videoMem;
    return true;
}

bool Renderer::registerBuffers()
{
    size_t singleFbSize = FRAME_WIDTH * FRAME_HEIGHT * FRAME_DEPTH;
    for (int i = 0; i < NUM_BUFFERS; i++) {
        frameBuffers[i] = (char *)videoMemSP;
        videoMemSP += singleFbSize;
    }

    sceVideoOutSetBufferAttribute(&attr, 0x80000000, 1, 0, FRAME_WIDTH, FRAME_HEIGHT, FRAME_WIDTH);
    int rc = sceVideoOutRegisterBuffers(videoHandle, 0, (void **)frameBuffers, NUM_BUFFERS, &attr);
    return (rc == 0);
}

bool Renderer::Init()
{
    videoHandle = sceVideoOutOpen(ORBIS_VIDEO_USER_MAIN, ORBIS_VIDEO_OUT_BUS_MAIN, 0, nullptr);
    if (videoHandle < 0) return false;

    if (!initFlipQueue()) return false;
    if (!allocateVideoMemory(0x2000000, 0x200000)) return false; // 32MB allocation
    if (!registerBuffers()) return false;

    sceVideoOutSetFlipRate(videoHandle, 0); // 60 FPS
    activeBufferIdx = 0;
    frameId = 0;
    Clear();
    return true;
}

void Renderer::Clear(Color c)
{
    DrawRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT, c);
}

void Renderer::DrawPixel(int x, int y, Color c)
{
    if (x < 0 || x >= FRAME_WIDTH || y < 0 || y >= FRAME_HEIGHT) return;
    uint32_t *fb = (uint32_t *)frameBuffers[activeBufferIdx];
    fb[y * FRAME_WIDTH + x] = 0xFF000000 | (c.r << 16) | (c.g << 8) | c.b;
}

void Renderer::DrawHLine(int x, int y, int w, Color c)
{
    if (y < 0 || y >= FRAME_HEIGHT) return;
    int startX = x < 0 ? 0 : x;
    int endX = (x + w) > FRAME_WIDTH ? FRAME_WIDTH : (x + w);
    if (startX >= endX) return;

    uint32_t *fb = (uint32_t *)frameBuffers[activeBufferIdx] + (y * FRAME_WIDTH);
    uint32_t colorVal = 0xFF000000 | (c.r << 16) | (c.g << 8) | c.b;
    for (int px = startX; px < endX; px++) {
        fb[px] = colorVal;
    }
}

void Renderer::DrawVLine(int x, int y, int h, Color c)
{
    if (x < 0 || x >= FRAME_WIDTH) return;
    int startY = y < 0 ? 0 : y;
    int endY = (y + h) > FRAME_HEIGHT ? FRAME_HEIGHT : (y + h);
    if (startY >= endY) return;

    uint32_t *fb = (uint32_t *)frameBuffers[activeBufferIdx] + x;
    uint32_t colorVal = 0xFF000000 | (c.r << 16) | (c.g << 8) | c.b;
    for (int py = startY; py < endY; py++) {
        fb[py * FRAME_WIDTH] = colorVal;
    }
}

void Renderer::DrawRect(int x, int y, int w, int h, Color c)
{
    int startY = y < 0 ? 0 : y;
    int endY = (y + h) > FRAME_HEIGHT ? FRAME_HEIGHT : (y + h);
    int startX = x < 0 ? 0 : x;
    int endX = (x + w) > FRAME_WIDTH ? FRAME_WIDTH : (x + w);
    if (startX >= endX || startY >= endY) return;

    uint32_t colorVal = 0xFF000000 | (c.r << 16) | (c.g << 8) | c.b;
    for (int py = startY; py < endY; py++) {
        uint32_t *row = (uint32_t *)frameBuffers[activeBufferIdx] + (py * FRAME_WIDTH);
        for (int px = startX; px < endX; px++) {
            row[px] = colorVal;
        }
    }
}

void Renderer::DrawOutlineRect(int x, int y, int w, int h, int thickness, Color c)
{
    for (int i = 0; i < thickness; i++) {
        DrawHLine(x + i, y + i, w - (i * 2), c);
        DrawHLine(x + i, y + h - 1 - i, w - (i * 2), c);
        DrawVLine(x + i, y + i, h - (i * 2), c);
        DrawVLine(x + w - 1 - i, y + i, h - (i * 2), c);
    }
}

void Renderer::DrawGradientV(int x, int y, int w, int h, Color top, Color bottom)
{
    int startY = y < 0 ? 0 : y;
    int endY = (y + h) > FRAME_HEIGHT ? FRAME_HEIGHT : (y + h);
    int startX = x < 0 ? 0 : x;
    int endX = (x + w) > FRAME_WIDTH ? FRAME_WIDTH : (x + w);
    if (startX >= endX || startY >= endY || h <= 0) return;

    for (int py = startY; py < endY; py++) {
        float t = (float)(py - y) / (float)h;
        uint8_t r = (uint8_t)(top.r + t * (bottom.r - top.r));
        uint8_t g = (uint8_t)(top.g + t * (bottom.g - top.g));
        uint8_t b = (uint8_t)(top.b + t * (bottom.b - top.b));
        uint32_t colorVal = 0xFF000000 | (r << 16) | (g << 8) | b;

        uint32_t *row = (uint32_t *)frameBuffers[activeBufferIdx] + (py * FRAME_WIDTH);
        for (int px = startX; px < endX; px++) {
            row[px] = colorVal;
        }
    }
}

void Renderer::DrawProgressBar(int x, int y, int w, int h, float progress, Color fg, Color bg)
{
    if (progress < 0.0f) progress = 0.0f;
    if (progress > 1.0f) progress = 1.0f;

    DrawRect(x, y, w, h, bg);
    int fillW = (int)(w * progress);
    if (fillW > 0) {
        DrawRect(x, y, fillW, h, fg);
    }
    DrawOutlineRect(x, y, w, h, 1, Color::PanelBorder());
}

void Renderer::DrawChar(char ch, int x, int y, int scale, Color fg, Color bg, bool transparent)
{
    uint8_t cIdx = (uint8_t)ch;
    if (cIdx < 32 || cIdx > 127) cIdx = 32;
    int fontIdx = cIdx - 32;

    for (int row = 0; row < 16; row++) {
        uint8_t bits = font8x16[fontIdx][row];
        for (int col = 0; col < 8; col++) {
            bool on = (bits & (1 << (7 - col))) != 0;
            if (on) {
                if (scale == 1) {
                    DrawPixel(x + col, y + row, fg);
                } else {
                    DrawRect(x + (col * scale), y + (row * scale), scale, scale, fg);
                }
            } else if (!transparent) {
                if (scale == 1) {
                    DrawPixel(x + col, y + row, bg);
                } else {
                    DrawRect(x + (col * scale), y + (row * scale), scale, scale, bg);
                }
            }
        }
    }
}

void Renderer::DrawText(const char *text, int x, int y, int scale, Color fg, Color bg, bool transparent)
{
    if (!text) return;
    int curX = x;
    int curY = y;
    int charW = 8 * scale;
    int charH = 16 * scale;

    while (*text) {
        if (*text == '\n') {
            curX = x;
            curY += charH + (2 * scale);
        } else {
            DrawChar(*text, curX, curY, scale, fg, bg, transparent);
            curX += charW;
        }
        text++;
    }
}

void Renderer::DrawTextCentered(const char *text, int centerX, int y, int scale, Color fg)
{
    if (!text) return;
    int len = (int)strlen(text);
    int totalW = len * (8 * scale);
    int startX = centerX - (totalW / 2);
    DrawText(text, startX, y, scale, fg);
}

void Renderer::DrawBadge(const char *text, int x, int y, Color fg, Color bg)
{
    if (!text) return;
    int len = (int)strlen(text);
    int padX = 10;
    int padY = 6;
    int w = (len * 8) + (padX * 2);
    int h = 16 + (padY * 2);

    DrawRect(x, y, w, h, bg);
    DrawOutlineRect(x, y, w, h, 1, fg);
    DrawText(text, x + padX, y + padY, 1, fg);
}

void Renderer::DrawCard(int x, int y, int w, int h, const char *title, Color border)
{
    DrawRect(x, y, w, h, Color::Panel());
    DrawOutlineRect(x, y, w, h, 2, border);
    if (title && title[0]) {
        DrawRect(x, y, w, 36, Color(30, 34, 46));
        DrawHLine(x, y + 36, w, border);
        DrawText(title, x + 16, y + 10, 1, Color::Gold());
    }
}

void Renderer::DrawMovieCard(int x, int y, int w, int h, const char *title, const char *year, const char *rating, const char *genre, const char *quality, bool isSelected)
{
    // Focus glow border if card is selected by user controller
    if (isSelected) {
        DrawOutlineRect(x - 5, y - 5, w + 10, h + 10, 4, Color::Gold());
    }

    // Card background gradient
    Color topBg = isSelected ? Color(36, 44, 62) : Color(22, 26, 36);
    Color botBg = isSelected ? Color(20, 24, 34) : Color(14, 16, 22);
    DrawGradientV(x, y, w, h, topBg, botBg);
    DrawOutlineRect(x, y, w, h, 1, isSelected ? Color::Gold() : Color::PanelBorder());

    // Top Genre Header
    DrawRect(x, y, w, 28, isSelected ? Color(48, 56, 80) : Color(28, 32, 44));
    DrawHLine(x, y + 28, w, isSelected ? Color::Gold() : Color::PanelBorder());
    if (genre && genre[0]) {
        DrawText(genre, x + 10, y + 6, 1, isSelected ? Color::Gold() : Color::Cyan());
    }

    // Central Title Display
    // Split title into two lines if it's long (>18 chars)
    if (title && title[0]) {
        int titleLen = (int)strlen(title);
        if (titleLen <= 18) {
            DrawTextCentered(title, x + (w / 2), y + 70, 1, isSelected ? Color::Gold() : Color::White());
        } else {
            // Find a space near the middle
            char line1[24];
            char line2[24];
            memset(line1, 0, sizeof(line1));
            memset(line2, 0, sizeof(line2));
            int splitPos = 16;
            while (splitPos > 8 && title[splitPos] != ' ') splitPos--;
            if (splitPos <= 8) splitPos = 16;
            strncpy(line1, title, splitPos);
            strncpy(line2, title + (title[splitPos] == ' ' ? splitPos + 1 : splitPos), sizeof(line2) - 1);

            DrawTextCentered(line1, x + (w / 2), y + 60, 1, isSelected ? Color::Gold() : Color::White());
            DrawTextCentered(line2, x + (w / 2), y + 80, 1, isSelected ? Color::Gold() : Color::White());
        }
    }

    // Central Movie Icon / Badge
    int badgeBoxY = y + 120;
    DrawRect(x + 20, badgeBoxY, w - 40, 50, isSelected ? Color(44, 52, 74) : Color(26, 30, 42));
    DrawOutlineRect(x + 20, badgeBoxY, w - 40, 50, 1, isSelected ? Color::Gold() : Color::PanelBorder());
    DrawTextCentered("SOULIMA CINEMA", x + (w / 2), badgeBoxY + 12, 1, Color::Gray());
    DrawTextCentered("HD P2P STREAM", x + (w / 2), badgeBoxY + 28, 1, Color::DarkGray());

    // Quality Badge
    if (quality && quality[0]) {
        DrawBadge(quality, x + 12, y + h - 68, isSelected ? Color::White() : Color::Gray(), isSelected ? Color::Crimson() : Color(35, 40, 54));
    }

    // Rating & Year bottom bar
    char starBuf[16];
    snprintf(starBuf, sizeof(starBuf), "* %s", rating ? rating : "8.0");
    DrawText(starBuf, x + 14, y + h - 30, 1, Color::Gold());

    if (year && year[0]) {
        DrawText(year, x + w - 48, y + h - 30, 1, Color::Gray());
    }
}

void Renderer::Flip()
{
    sceVideoOutSubmitFlip(videoHandle, activeBufferIdx, ORBIS_VIDEO_OUT_FLIP_VSYNC, frameId);

    OrbisKernelEvent evt;
    int count = 0;
    for (;;) {
        OrbisVideoOutFlipStatus status;
        sceVideoOutGetFlipStatus(videoHandle, &status);
        if (status.flipArg == frameId) break;
        if (sceKernelWaitEqueue(flipQueue, &evt, 1, &count, 0) != 0) break;
    }

    activeBufferIdx = (activeBufferIdx + 1) % NUM_BUFFERS;
    frameId++;
}
