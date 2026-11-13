#include "network.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/time.h>
#include <fcntl.h>
#include <errno.h>

NetworkManager::NetworkManager()
    : port(3030), status(ServerStatus::Unchecked), lastLatencyMs(-1)
{
    memset(urlBuffer, 0, sizeof(urlBuffer));
    InitDefault(192, 168, 1, 68, 3030);
    strcpy(statusMessage, "Connection Unchecked. Press [Square] to Ping.");
}

void NetworkManager::InitDefault(uint8_t a, uint8_t b, uint8_t c, uint8_t d, uint16_t p)
{
    ip[0] = a;
    ip[1] = b;
    ip[2] = c;
    ip[3] = d;
    port = p;
    GetUrl();
}

const char *NetworkManager::GetUrl()
{
    snprintf(urlBuffer, sizeof(urlBuffer), "http://%d.%d.%d.%d:%d", ip[0], ip[1], ip[2], ip[3], port);
    return urlBuffer;
}

bool NetworkManager::LoadConfig()
{
    const char *paths[] = { "/data/soulima.conf", "/app0/soulima.conf", "soulima.conf" };
    FILE *f = nullptr;
    for (const char *p : paths) {
        f = fopen(p, "r");
        if (f) break;
    }
    if (!f) return false;

    char line[256];
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "SERVER_URL=", 11) == 0) {
            char *url = line + 11;
            char *pHttp = strstr(url, "http://");
            if (pHttp) url = pHttp + 7;
            int a, b, c, d, p = 3030;
            if (sscanf(url, "%d.%d.%d.%d:%d", &a, &b, &c, &d, &p) >= 4) {
                ip[0] = (uint8_t)a;
                ip[1] = (uint8_t)b;
                ip[2] = (uint8_t)c;
                ip[3] = (uint8_t)d;
                port = (uint16_t)p;
            }
        }
    }
    fclose(f);
    GetUrl();
    return true;
}

bool NetworkManager::SaveConfig()
{
    FILE *f = fopen("/data/soulima.conf", "w");
    if (!f) return false;
    fprintf(f, "# Soulima PS4 Configuration\n");
    fprintf(f, "SERVER_URL=%s\n", GetUrl());
    fclose(f);
    return true;
}

bool NetworkManager::TestConnection()
{
    status = ServerStatus::Checking;
    strcpy(statusMessage, "Connecting to streaming server...");

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        status = ServerStatus::Offline;
        snprintf(statusMessage, sizeof(statusMessage), "Socket error: %s", strerror(errno));
        return false;
    }

    struct timeval timeout;
    timeout.tv_sec = 1;
    timeout.tv_usec = 500000; // 1.5 seconds timeout
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (char *)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (char *)&timeout, sizeof(timeout));

    struct sockaddr_in saddr;
    memset(&saddr, 0, sizeof(saddr));
    saddr.sin_family = AF_INET;
    saddr.sin_port = htons(port);

    char ipStr[32];
    snprintf(ipStr, sizeof(ipStr), "%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);
    inet_pton(AF_INET, ipStr, &saddr.sin_addr);

    struct timeval tStart, tEnd;
    gettimeofday(&tStart, nullptr);

    int rc = connect(sock, (struct sockaddr *)&saddr, sizeof(saddr));
    gettimeofday(&tEnd, nullptr);

    if (rc == 0) {
        long sec = tEnd.tv_sec - tStart.tv_sec;
        long usec = tEnd.tv_usec - tStart.tv_usec;
        lastLatencyMs = (int)((sec * 1000) + (usec / 1000));
        status = ServerStatus::Online;
        snprintf(statusMessage, sizeof(statusMessage), "Online! Latency: %d ms (Torrent Engine Ready)", lastLatencyMs);
        close(sock);
        return true;
    } else {
        lastLatencyMs = -1;
        status = ServerStatus::Offline;
        snprintf(statusMessage, sizeof(statusMessage), "Offline: Unreachable at %s:%d", ipStr, port);
        close(sock);
        return false;
    }
}
