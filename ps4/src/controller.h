#ifndef CONTROLLER_H
#define CONTROLLER_H

#include <stdint.h>
#include <orbis/Pad.h>
#include <orbis/UserService.h>

class Controller {
private:
    int padHandle;
    int userId;
    uint32_t currentButtons;
    uint32_t previousButtons;
    uint32_t justPressedButtons;
    OrbisPadData padData;

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
};

#endif // CONTROLLER_H
