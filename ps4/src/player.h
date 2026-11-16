#ifndef PLAYER_H
#define PLAYER_H

#include "renderer.h"
#include "network.h"
#include <stdint.h>
#include <stddef.h>
#include <sys/types.h>

#ifdef SOULIMA_HOST
#include <SDL2/SDL.h>
#else
#include <orbis/AvPlayer.h>
#endif

enum class PlayerState {
    Stopped,
    ConnectingSwarm,
    Buffering,
    Playing,
    Paused
};

class CinemaPlayer {
private:
    PlayerState state;
    char currentTitle[64];
    char currentQuality[16];
    char currentStreamId[64];
    char currentStreamUrl[256];
    char currentMagnet[512];

    int currentDurationSec;
    int currentPositionSec;
    int bufferPercent;
    int seeds;
    int peers;
    int speedKb;

    int frameCounter;
    int hudTimer;
    bool hudVisible;

#ifdef SOULIMA_HOST
    FILE *videoPipe;
    Texture *currentFrameTex;
    uint8_t *frameRgbaBuffer;
    int pipeWidth;
    int pipeHeight;
#else
    int avPlayerHandle;
#endif

    void StartVideoDecoder(int startSec);
    void StopVideoDecoder();

public:
    CinemaPlayer();
    ~CinemaPlayer();

    void Start(const char *title, const char *quality, const char *magnet, NetworkManager *net);
    void Update(NetworkManager *net);
    void Render(Renderer *renderer);

    void TogglePlayPause();
    void SeekRelative(int seconds, NetworkManager *net);
    void Stop();

    bool IsActive() const { return state != PlayerState::Stopped; }
    PlayerState GetState() const { return state; }
    bool IsPlaying() const { return state == PlayerState::Playing; }
};

#endif // PLAYER_H
