#include "renderer.h"
#include "font8x16.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

static inline int clamp_i(int v, int minV, int maxV) {
    if (v < minV) return minV;
    if (v > maxV) return maxV;
    return v;
}

Renderer::Renderer()
    : activeBufferIdx(0), frameId(0)
{
    memset(frameBuffers, 0, sizeof(frameBuffers));
#ifdef SOULIMA_HOST
    sdlWindow = nullptr;
    sdlRenderer = nullptr;
    sdlTexture = nullptr;
#else
    videoHandle = -1;
    directMemOff = 0;
    directMemSize = 0;
    videoMem = nullptr;
    videoMemSP = 0;
#endif
}

Renderer::~Renderer()
{
#ifdef SOULIMA_HOST
    if (sdlTexture) SDL_DestroyTexture(sdlTexture);
    if (sdlRenderer) SDL_DestroyRenderer(sdlRenderer);
    if (sdlWindow) SDL_DestroyWindow(sdlWindow);
    for (int i = 0; i < NUM_BUFFERS; i++) {
        if (frameBuffers[i]) free(frameBuffers[i]);
    }
    SDL_QuitSubSystem(SDL_INIT_VIDEO);
#else
    if (directMemOff && directMemSize) {
        sceKernelReleaseDirectMemory(directMemOff, directMemSize);
    }
#endif
}

#ifndef SOULIMA_HOST
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
#endif

bool Renderer::Init()
{
#ifdef SOULIMA_HOST
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER) != 0) {
        fprintf(stderr, "[HOST] SDL_Init Error: %s\n", SDL_GetError());
        return false;
    }

    sdlWindow = SDL_CreateWindow(
        "Soulima Cinema — PS4 Native TV App Simulator",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        1280, 720,
        SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE
    );
    if (!sdlWindow) {
        fprintf(stderr, "[HOST] SDL_CreateWindow Error: %s\n", SDL_GetError());
        return false;
    }

    sdlRenderer = SDL_CreateRenderer(sdlWindow, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (!sdlRenderer) {
        sdlRenderer = SDL_CreateRenderer(sdlWindow, -1, SDL_RENDERER_SOFTWARE);
    }
    if (!sdlRenderer) {
        fprintf(stderr, "[HOST] SDL_CreateRenderer Error: %s\n", SDL_GetError());
        return false;
    }

    SDL_RenderSetLogicalSize(sdlRenderer, FRAME_WIDTH, FRAME_HEIGHT);

    sdlTexture = SDL_CreateTexture(
        sdlRenderer,
        SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING,
        FRAME_WIDTH, FRAME_HEIGHT
    );
    if (!sdlTexture) {
        fprintf(stderr, "[HOST] SDL_CreateTexture Error: %s\n", SDL_GetError());
        return false;
    }

    size_t singleFbSize = FRAME_WIDTH * FRAME_HEIGHT * FRAME_DEPTH;
    for (int i = 0; i < NUM_BUFFERS; i++) {
        frameBuffers[i] = (char *)malloc(singleFbSize);
        if (!frameBuffers[i]) return false;
        memset(frameBuffers[i], 0, singleFbSize);
    }

    activeBufferIdx = 0;
    frameId = 0;
    Clear();
    return true;
#else
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
#endif
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

Texture *Renderer::LoadTextureFromMemory(const uint8_t *data, size_t size)
{
    if (!data || size == 0) return nullptr;
    int w = 0, h = 0, comp = 0;
    stbi_uc *img = stbi_load_from_memory(data, (int)size, &w, &h, &comp, 4);
    if (!img) return nullptr;

    Texture *t = new Texture();
    t->width = w;
    t->height = h;
    t->pixels = new uint32_t[w * h];

    for (int i = 0; i < w * h; i++) {
        uint8_t r = img[i * 4 + 0];
        uint8_t g = img[i * 4 + 1];
        uint8_t b = img[i * 4 + 2];
        uint8_t a = img[i * 4 + 3];
        t->pixels[i] = ((uint32_t)a << 24) | ((uint32_t)r << 16) | ((uint32_t)g << 8) | (uint32_t)b;
    }
    stbi_image_free(img);
    return t;
}

Texture *Renderer::LoadTexture(const char *filepath)
{
    if (!filepath || !filepath[0]) return nullptr;
    FILE *f = fopen(filepath, "rb");
    if (!f) return nullptr;
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz <= 0) { fclose(f); return nullptr; }

    uint8_t *buf = new uint8_t[sz];
    fread(buf, 1, sz, f);
    fclose(f);

    Texture *tex = LoadTextureFromMemory(buf, (size_t)sz);
    delete[] buf;
    return tex;
}

void Renderer::FreeTexture(Texture *tex)
{
    if (tex) {
        delete tex;
    }
}

void Renderer::DrawTexture(const Texture *tex, int x, int y, int w, int h, uint8_t alpha)
{
    if (!tex || !tex->pixels || w <= 0 || h <= 0) return;
    uint32_t *buf32 = (uint32_t *)frameBuffers[activeBufferIdx];

    int startY = clamp_i(y, 0, FRAME_HEIGHT);
    int endY = clamp_i(y + h, 0, FRAME_HEIGHT);
    int startX = clamp_i(x, 0, FRAME_WIDTH);
    int endX = clamp_i(x + w, 0, FRAME_WIDTH);

    for (int dstY = startY; dstY < endY; dstY++) {
        int srcY = ((dstY - y) * tex->height) / h;
        if (srcY >= tex->height) srcY = tex->height - 1;
        uint32_t *dstRow = &buf32[dstY * FRAME_WIDTH];
        const uint32_t *srcRow = &tex->pixels[srcY * tex->width];

        for (int dstX = startX; dstX < endX; dstX++) {
            int srcX = ((dstX - x) * tex->width) / w;
            if (srcX >= tex->width) srcX = tex->width - 1;
            uint32_t p = srcRow[srcX];
            uint8_t a = (p >> 24) & 0xFF;
            if (alpha < 255) a = (a * alpha) / 255;
            if (a == 255) {
                dstRow[dstX] = p;
            } else if (a > 0) {
                uint32_t bg = dstRow[dstX];
                uint8_t r = (((p >> 16) & 0xFF) * a + ((bg >> 16) & 0xFF) * (255 - a)) / 255;
                uint8_t g = (((p >> 8) & 0xFF) * a + ((bg >> 8) & 0xFF) * (255 - a)) / 255;
                uint8_t b = ((p & 0xFF) * a + (bg & 0xFF) * (255 - a)) / 255;
                dstRow[dstX] = (0xFF << 24) | (r << 16) | (g << 8) | b;
            }
        }
    }
}

void Renderer::DrawTextureFadedV(const Texture *tex, int x, int y, int w, int h)
{
    if (!tex || !tex->pixels || w <= 0 || h <= 0) return;
    uint32_t *buf32 = (uint32_t *)frameBuffers[activeBufferIdx];

    int startY = clamp_i(y, 0, FRAME_HEIGHT);
    int endY = clamp_i(y + h, 0, FRAME_HEIGHT);
    int startX = clamp_i(x, 0, FRAME_WIDTH);
    int endX = clamp_i(x + w, 0, FRAME_WIDTH);

    int fadeStartY = y + (int)(h * 0.35f);
    int fadeLen = (y + h) - fadeStartY;
    if (fadeLen <= 0) fadeLen = 1;

    for (int dstY = startY; dstY < endY; dstY++) {
        int srcY = ((dstY - y) * tex->height) / h;
        if (srcY >= tex->height) srcY = tex->height - 1;
        uint32_t *dstRow = &buf32[dstY * FRAME_WIDTH];
        const uint32_t *srcRow = &tex->pixels[srcY * tex->width];

        uint8_t vAlpha = 255;
        if (dstY > fadeStartY) {
            float t = (float)(dstY - fadeStartY) / (float)fadeLen;
            if (t > 1.0f) t = 1.0f;
            vAlpha = (uint8_t)((1.0f - t) * 255.0f);
        }

        for (int dstX = startX; dstX < endX; dstX++) {
            int srcX = ((dstX - x) * tex->width) / w;
            if (srcX >= tex->width) srcX = tex->width - 1;
            uint32_t p = srcRow[srcX];
            uint8_t a = (p >> 24) & 0xFF;
            a = (a * vAlpha) / 255;
            if (a == 255) {
                dstRow[dstX] = p;
            } else if (a > 0) {
                uint32_t bg = dstRow[dstX];
                uint8_t r = (((p >> 16) & 0xFF) * a + ((bg >> 16) & 0xFF) * (255 - a)) / 255;
                uint8_t g = (((p >> 8) & 0xFF) * a + ((bg >> 8) & 0xFF) * (255 - a)) / 255;
                uint8_t b = ((p & 0xFF) * a + (bg & 0xFF) * (255 - a)) / 255;
                dstRow[dstX] = (0xFF << 24) | (r << 16) | (g << 8) | b;
            }
        }
    }
}

void Renderer::DrawMoviePosterCard(int x, int y, int w, int h, const Texture *posterTex, const char *title, const char *year, const char *rating, bool isSelected)
{
    // Focus glow border if selected
    if (isSelected) {
        DrawOutlineRect(x - 5, y - 5, w + 10, h + 10, 4, Color::Gold());
    }

    // Card background
    DrawRect(x, y, w, h, Color::CardBg());

    // Poster Image
    int posterH = h - 50;
    if (posterTex && posterTex->pixels) {
        DrawTexture(posterTex, x, y, w, posterH);
    } else {
        DrawRect(x, y, w, posterH, isSelected ? Color(36, 44, 62) : Color(24, 28, 40));
        DrawTextCentered("SOULIMA", x + (w / 2), y + (posterH / 2) - 10, 1, Color::Gray());
    }

    // Bottom info area
    int infoY = y + posterH;
    DrawRect(x, infoY, w, 50, isSelected ? Color(32, 38, 54) : Color(18, 20, 28));
    DrawHLine(x, infoY, w, isSelected ? Color::Gold() : Color::PanelBorder());

    // Title
    if (title && title[0]) {
        char shortTitle[22];
        strncpy(shortTitle, title, 20);
        shortTitle[20] = '\0';
        if (strlen(title) > 20) {
            shortTitle[17] = '.';
            shortTitle[18] = '.';
            shortTitle[19] = '.';
        }
        DrawText(shortTitle, x + 8, infoY + 8, 1, isSelected ? Color::Gold() : Color::White());
    }

    // Rating & Year
    char metaBuf[32];
    snprintf(metaBuf, sizeof(metaBuf), "* %s   %s", rating ? rating : "8.0", year ? year : "2024");
    DrawText(metaBuf, x + 8, infoY + 28, 1, isSelected ? Color::Gold() : Color::Gray());
}

void Renderer::Flip()
{
#ifdef SOULIMA_HOST
    SDL_UpdateTexture(sdlTexture, nullptr, frameBuffers[activeBufferIdx], FRAME_WIDTH * FRAME_DEPTH);
    SDL_RenderClear(sdlRenderer);
    SDL_RenderCopy(sdlRenderer, sdlTexture, nullptr, nullptr);
    SDL_RenderPresent(sdlRenderer);
    SDL_Delay(16);

    activeBufferIdx = (activeBufferIdx + 1) % NUM_BUFFERS;
    frameId++;
#else
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
#endif
}
