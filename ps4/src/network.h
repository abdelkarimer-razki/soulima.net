#ifndef NETWORK_H
#define NETWORK_H

#include <stdint.h>
#include <stddef.h>

enum class ServerStatus {
    Unchecked,
    Checking,
    Online,
    Offline
};

class NetworkManager {
public:
    uint8_t ip[4];
    uint16_t port;
    ServerStatus status;
    int lastLatencyMs;
    char statusMessage[128];
    char urlBuffer[64];

    NetworkManager();

    void InitDefault(uint8_t a = 192, uint8_t b = 168, uint8_t c = 1, uint8_t d = 68, uint16_t p = 3030);
    bool LoadConfig();
    bool SaveConfig();

    bool TestConnection();
    const char *GetUrl();
};

#endif // NETWORK_H
