#ifndef PLAYER_H
#define PLAYER_H

#include "renderer.h"
#include "network.h"
#include <stdint.h>
#include <stddef.h>

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

    int currentDurationSec;
    int currentPositionSec;
    int bufferPercent;
    int seeds;
    int peers;
    int speedKb;

    int frameCounter;
    int hudTimer;
    bool hudVisible;

public:
    CinemaPlayer();

    void Start(const char *title, const char *quality, const char *magnet, NetworkManager *net);
    void Update(NetworkManager *net);
    void Render(Renderer *renderer);

    void TogglePlayPause();
    void SeekRelative(int seconds);
    void Stop();

    bool IsActive() const { return state != PlayerState::Stopped; }
    PlayerState GetState() const { return state; }
};

#endif // PLAYER_H
