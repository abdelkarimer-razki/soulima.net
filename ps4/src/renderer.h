#ifndef RENDERER_H
#define RENDERER_H

#include <stdint.h>
#include <stddef.h>

#ifdef SOULIMA_HOST
#include <SDL2/SDL.h>
#else
#include <orbis/libkernel.h>
#include <orbis/VideoOut.h>
#include <orbis/Sysmodule.h>
#endif

struct Color {
    uint8_t r;
    uint8_t g;
    uint8_t b;
    uint8_t a;
    
    constexpr Color(uint8_t red = 0, uint8_t green = 0, uint8_t blue = 0, uint8_t alpha = 255)
        : r(red), g(green), b(blue), a(alpha) {}
        
    static constexpr Color Bg()          { return Color(11, 13, 19); }
    static constexpr Color Panel()       { return Color(20, 24, 33); }
    static constexpr Color PanelBorder() { return Color(40, 48, 66); }
    static constexpr Color CardBg()      { return Color(24, 28, 40); }
    static constexpr Color Gold()        { return Color(245, 158, 11); }
    static constexpr Color GoldDim()     { return Color(140, 95, 10); }
    static constexpr Color Crimson()     { return Color(225, 29, 72); }
    static constexpr Color White()       { return Color(240, 243, 246); }
    static constexpr Color Gray()        { return Color(140, 150, 165); }
    static constexpr Color DarkGray()    { return Color(70, 78, 92); }
    static constexpr Color Green()       { return Color(34, 197, 94); }
    static constexpr Color Cyan()        { return Color(6, 182, 212); }
    static constexpr Color Blue()        { return Color(59, 130, 246); }
};

class Renderer {
private:
    static const int FRAME_WIDTH  = 1920;
    static const int FRAME_HEIGHT = 1080;
    static const int FRAME_DEPTH  = 4; // 32-bit ARGB
    static const int NUM_BUFFERS  = 2;

#ifdef SOULIMA_HOST
    SDL_Window *sdlWindow;
    SDL_Renderer *sdlRenderer;
    SDL_Texture *sdlTexture;
#else
    int videoHandle;
    off_t directMemOff;
    size_t directMemSize;
    void *videoMem;
    uintptr_t videoMemSP;
    OrbisKernelEqueue flipQueue;
    OrbisVideoOutBufferAttribute attr;

    bool initFlipQueue();
    bool allocateVideoMemory(size_t size, int alignment);
    bool registerBuffers();
#endif

    char *frameBuffers[NUM_BUFFERS];
    int activeBufferIdx;
    int frameId;

public:
    Renderer();
    ~Renderer();

    bool Init();
    void Clear(Color c = Color::Bg());
    void DrawPixel(int x, int y, Color c);
    void DrawRect(int x, int y, int w, int h, Color c);
    void DrawOutlineRect(int x, int y, int w, int h, int thickness, Color c);
    void DrawHLine(int x, int y, int w, Color c);
    void DrawVLine(int x, int y, int h, Color c);
    void DrawGradientV(int x, int y, int w, int h, Color top, Color bottom);
    void DrawProgressBar(int x, int y, int w, int h, float progress, Color fg = Color::Gold(), Color bg = Color(28, 32, 44));

    void DrawChar(char ch, int x, int y, int scale, Color fg, Color bg = Color(0,0,0,0), bool transparent = true);
    void DrawText(const char *text, int x, int y, int scale, Color fg, Color bg = Color(0,0,0,0), bool transparent = true);
    void DrawTextCentered(const char *text, int centerX, int y, int scale, Color fg);
    void DrawBadge(const char *text, int x, int y, Color fg, Color bg);
    void DrawCard(int x, int y, int w, int h, const char *title, Color border = Color::PanelBorder());
    void DrawMovieCard(int x, int y, int w, int h, const char *title, const char *year, const char *rating, const char *genre, const char *quality, bool isSelected);

    void Flip();
};

#endif // RENDERER_H
