#ifndef CONTROLLER_H
#define CONTROLLER_H

#include <stdint.h>

#ifdef SOULIMA_HOST
#include <SDL2/SDL.h>
enum OrbisPadButton {
    ORBIS_PAD_BUTTON_L3 = 0x0002,
    ORBIS_PAD_BUTTON_R3 = 0x0004,
    ORBIS_PAD_BUTTON_OPTIONS = 0x0008,
    ORBIS_PAD_BUTTON_UP = 0x0010,
    ORBIS_PAD_BUTTON_RIGHT = 0x0020,
    ORBIS_PAD_BUTTON_DOWN = 0x0040,
    ORBIS_PAD_BUTTON_LEFT = 0x0080,
    ORBIS_PAD_BUTTON_L2 = 0x0100,
    ORBIS_PAD_BUTTON_R2 = 0x0200,
    ORBIS_PAD_BUTTON_L1 = 0x0400,
    ORBIS_PAD_BUTTON_R1 = 0x0800,
    ORBIS_PAD_BUTTON_TRIANGLE = 0x1000,
    ORBIS_PAD_BUTTON_CIRCLE = 0x2000,
    ORBIS_PAD_BUTTON_CROSS = 0x4000,
    ORBIS_PAD_BUTTON_SQUARE = 0x8000,
    ORBIS_PAD_BUTTON_TOUCH_PAD = 0x100000
};
#else
#include <orbis/Pad.h>
#include <orbis/UserService.h>
#endif

class Controller {
private:
    int padHandle;
    int userId;
    uint32_t currentButtons;
    uint32_t previousButtons;
    uint32_t justPressedButtons;

#ifdef SOULIMA_HOST
    SDL_GameController *sdlGamepad;
    bool quitRequested;
#else
    OrbisPadData padData;
#endif

    int repeatCounter;
    uint32_t repeatButton;

public:
    Controller();
    ~Controller();

    bool Init();
    void Update();

    bool IsDown(uint32_t buttonMask) const;
    bool JustPressed(uint32_t buttonMask) const;
    bool HoldOrRepeat(uint32_t buttonMask);

    bool Cross()    const { return JustPressed(ORBIS_PAD_BUTTON_CROSS); }
    bool Circle()   const { return JustPressed(ORBIS_PAD_BUTTON_CIRCLE); }
    bool Square()   const { return JustPressed(ORBIS_PAD_BUTTON_SQUARE); }
    bool Triangle() const { return JustPressed(ORBIS_PAD_BUTTON_TRIANGLE); }

    bool Up()       { return HoldOrRepeat(ORBIS_PAD_BUTTON_UP); }
    bool Down()     { return HoldOrRepeat(ORBIS_PAD_BUTTON_DOWN); }
    bool Left()     { return HoldOrRepeat(ORBIS_PAD_BUTTON_LEFT); }
    bool Right()    { return HoldOrRepeat(ORBIS_PAD_BUTTON_RIGHT); }

    bool L1()       const { return JustPressed(ORBIS_PAD_BUTTON_L1); }
    bool R1()       const { return JustPressed(ORBIS_PAD_BUTTON_R1); }
    bool Options()  const { return JustPressed(ORBIS_PAD_BUTTON_OPTIONS); }

#ifdef SOULIMA_HOST
    bool QuitRequested() const { return quitRequested; }
#else
    bool QuitRequested() const { return false; }
#endif
};

#endif // CONTROLLER_H
