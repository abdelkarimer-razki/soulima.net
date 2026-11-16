#include "controller.h"
#include <string.h>

Controller::Controller()
    : padHandle(-1), userId(-1), currentButtons(0), previousButtons(0),
      justPressedButtons(0), repeatCounter(0), repeatButton(0)
{
#ifdef SOULIMA_HOST
    sdlGamepad = nullptr;
    quitRequested = false;
#else
    memset(&padData, 0, sizeof(padData));
#endif
}

Controller::~Controller()
{
#ifdef SOULIMA_HOST
    if (sdlGamepad) {
        SDL_GameControllerClose(sdlGamepad);
    }
#else
    if (padHandle >= 0) {
        scePadClose(padHandle);
    }
#endif
}

bool Controller::Init()
{
#ifdef SOULIMA_HOST
    if (SDL_NumJoysticks() > 0) {
        sdlGamepad = SDL_GameControllerOpen(0);
    }
    return true;
#else
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
#endif
}

void Controller::Update()
{
    previousButtons = currentButtons;

#ifdef SOULIMA_HOST
    SDL_Event ev;
    while (SDL_PollEvent(&ev)) {
        if (ev.type == SDL_QUIT) {
            quitRequested = true;
            currentButtons |= ORBIS_PAD_BUTTON_CIRCLE;
        }
    }

    const uint8_t *keystate = SDL_GetKeyboardState(nullptr);
    currentButtons = 0;

    // Keyboard bindings for PC test runner
    if (keystate[SDL_SCANCODE_UP] || keystate[SDL_SCANCODE_W])       currentButtons |= ORBIS_PAD_BUTTON_UP;
    if (keystate[SDL_SCANCODE_DOWN] || keystate[SDL_SCANCODE_S])     currentButtons |= ORBIS_PAD_BUTTON_DOWN;
    if (keystate[SDL_SCANCODE_LEFT] || keystate[SDL_SCANCODE_A])     currentButtons |= ORBIS_PAD_BUTTON_LEFT;
    if (keystate[SDL_SCANCODE_RIGHT] || keystate[SDL_SCANCODE_D])    currentButtons |= ORBIS_PAD_BUTTON_RIGHT;

    if (keystate[SDL_SCANCODE_RETURN] || keystate[SDL_SCANCODE_SPACE] || keystate[SDL_SCANCODE_Z] || keystate[SDL_SCANCODE_K])
        currentButtons |= ORBIS_PAD_BUTTON_CROSS;

    if (keystate[SDL_SCANCODE_ESCAPE] || keystate[SDL_SCANCODE_BACKSPACE] || keystate[SDL_SCANCODE_X] || keystate[SDL_SCANCODE_J])
        currentButtons |= ORBIS_PAD_BUTTON_CIRCLE;

    if (keystate[SDL_SCANCODE_C] || keystate[SDL_SCANCODE_U])
        currentButtons |= ORBIS_PAD_BUTTON_SQUARE;

    if (keystate[SDL_SCANCODE_V] || keystate[SDL_SCANCODE_I])
        currentButtons |= ORBIS_PAD_BUTTON_TRIANGLE;

    if (keystate[SDL_SCANCODE_Q] || keystate[SDL_SCANCODE_PAGEUP])
        currentButtons |= ORBIS_PAD_BUTTON_L1;

    if (keystate[SDL_SCANCODE_E] || keystate[SDL_SCANCODE_PAGEDOWN])
        currentButtons |= ORBIS_PAD_BUTTON_R1;

    if (keystate[SDL_SCANCODE_TAB] || keystate[SDL_SCANCODE_O])
        currentButtons |= ORBIS_PAD_BUTTON_OPTIONS;

    // If DualShock 4 or gamepad is connected via USB/Bluetooth to PC
    if (sdlGamepad) {
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_DPAD_UP))        currentButtons |= ORBIS_PAD_BUTTON_UP;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_DPAD_DOWN))      currentButtons |= ORBIS_PAD_BUTTON_DOWN;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_DPAD_LEFT))      currentButtons |= ORBIS_PAD_BUTTON_LEFT;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_DPAD_RIGHT))     currentButtons |= ORBIS_PAD_BUTTON_RIGHT;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_A))              currentButtons |= ORBIS_PAD_BUTTON_CROSS;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_B))              currentButtons |= ORBIS_PAD_BUTTON_CIRCLE;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_X))              currentButtons |= ORBIS_PAD_BUTTON_SQUARE;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_Y))              currentButtons |= ORBIS_PAD_BUTTON_TRIANGLE;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_LEFTSHOULDER))   currentButtons |= ORBIS_PAD_BUTTON_L1;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_RIGHTSHOULDER))  currentButtons |= ORBIS_PAD_BUTTON_R1;
        if (SDL_GameControllerGetButton(sdlGamepad, SDL_CONTROLLER_BUTTON_START))          currentButtons |= ORBIS_PAD_BUTTON_OPTIONS;
    }
#else
    if (padHandle < 0) return;

    int rc = scePadReadState(padHandle, &padData);
    if (rc == 0 && padData.connected) {
        currentButtons = padData.buttons;
    } else {
        currentButtons = 0;
    }
#endif

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
