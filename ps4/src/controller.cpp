#include "controller.h"
#include <string.h>

Controller::Controller()
    : padHandle(-1), userId(-1), currentButtons(0), previousButtons(0),
      justPressedButtons(0), repeatCounter(0), repeatButton(0)
{
    memset(&padData, 0, sizeof(padData));
}

Controller::~Controller()
{
    if (padHandle >= 0) {
        scePadClose(padHandle);
    }
}

bool Controller::Init()
{
    if (scePadInit() != 0) {
        return false;
    }

    OrbisUserServiceInitializeParams params;
    params.priority = ORBIS_KERNEL_PRIO_FIFO_LOWEST;
    sceUserServiceInitialize(&params);

    if (sceUserServiceGetInitialUser(&userId) != 0 || userId < 0) {
        userId = 0;
    }

    padHandle = scePadOpen(userId, 0, 0, nullptr);
    return (padHandle >= 0);
}

void Controller::Update()
{
    if (padHandle < 0) return;

    previousButtons = currentButtons;
    int rc = scePadReadState(padHandle, &padData);
    if (rc == 0 && padData.connected) {
        currentButtons = padData.buttons;
    } else {
        currentButtons = 0;
    }

    justPressedButtons = currentButtons & ~previousButtons;

    if (currentButtons & repeatButton) {
        repeatCounter++;
    } else {
        repeatCounter = 0;
        repeatButton = 0;
    }
}

bool Controller::IsDown(uint32_t buttonMask) const
{
    return (currentButtons & buttonMask) != 0;
}

bool Controller::JustPressed(uint32_t buttonMask) const
{
    return (justPressedButtons & buttonMask) != 0;
}

bool Controller::HoldOrRepeat(uint32_t buttonMask)
{
    if (JustPressed(buttonMask)) {
        repeatButton = buttonMask;
        repeatCounter = 0;
        return true;
    }

    if ((currentButtons & buttonMask) && repeatButton == buttonMask) {
        // Initial delay 20 frames (~330ms), then repeat every 5 frames (~80ms)
        if (repeatCounter >= 20 && (repeatCounter % 5 == 0)) {
            return true;
        }
    }
    return false;
}
