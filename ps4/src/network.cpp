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
    strcpy(statusMessage, "Checking server connection...");
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

bool NetworkManager::SendHttpRequest(const char *method, const char *path, const char *body, char *responseBuf, size_t responseBufSize)
{
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return false;

    struct timeval timeout;
    timeout.tv_sec = 2;
    timeout.tv_usec = 500000; // 2.5s timeout
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (char *)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (char *)&timeout, sizeof(timeout));

    struct sockaddr_in saddr;
    memset(&saddr, 0, sizeof(saddr));
    saddr.sin_family = AF_INET;
    saddr.sin_port = htons(port);
    char ipStr[32];
    snprintf(ipStr, sizeof(ipStr), "%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);
    inet_pton(AF_INET, ipStr, &saddr.sin_addr);

    if (connect(sock, (struct sockaddr *)&saddr, sizeof(saddr)) != 0) {
        close(sock);
        return false;
    }

    char req[1024];
    int reqLen = 0;
    if (body && strlen(body) > 0) {
        reqLen = snprintf(req, sizeof(req),
            "%s %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: %zu\r\n"
            "Connection: close\r\n\r\n"
            "%s",
            method, path, ipStr, port, strlen(body), body);
    } else {
        reqLen = snprintf(req, sizeof(req),
            "%s %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Connection: close\r\n\r\n",
            method, path, ipStr, port);
    }

    send(sock, req, reqLen, 0);

    if (responseBuf && responseBufSize > 0) {
        memset(responseBuf, 0, responseBufSize);
        int totalRead = 0;
        int bytes = 0;
        while ((bytes = recv(sock, responseBuf + totalRead, responseBufSize - 1 - totalRead, 0)) > 0) {
            totalRead += bytes;
            if ((size_t)totalRead >= responseBufSize - 1) break;
        }
        responseBuf[totalRead] = '\0';
    }

    close(sock);
    return true;
}

bool NetworkManager::StartStream(const char *magnet, char *outStreamId, size_t outStreamIdSize)
{
    if (!magnet || !outStreamId || outStreamIdSize == 0) return false;

    char body[1024];
    snprintf(body, sizeof(body), "{\"torrent\":\"%s\"}", magnet);

    char resp[2048];
    if (!SendHttpRequest("POST", "/api/stream", body, resp, sizeof(resp))) {
        return false;
    }

    // Parse torrentId from json response
    char *pId = strstr(resp, "\"torrentId\":");
    if (pId) {
        pId += 12;
        while (*pId == ' ' || *pId == '\"') pId++;
        size_t idx = 0;
        while (idx < outStreamIdSize - 1 && *pId && *pId != '\"' && *pId != ',' && *pId != '}') {
            outStreamId[idx++] = *pId++;
        }
        outStreamId[idx] = '\0';
        return true;
    }

    return false;
}

bool NetworkManager::GetStreamStatus(const char *streamId, int *outBufferPercent, int *outSeeds, int *outPeers, int *outSpeedKb)
{
    if (!streamId) return false;
    char path[128];
    snprintf(path, sizeof(path), "/api/stream/%s/status", streamId);

    char resp[1024];
    if (!SendHttpRequest("GET", path, nullptr, resp, sizeof(resp))) {
        return false;
    }

    if (outBufferPercent) {
        char *p = strstr(resp, "\"progress\":");
        if (p) {
            float prg = 0.0f;
            if (sscanf(p + 11, "%f", &prg) == 1) {
                *outBufferPercent = (int)(prg * 100.0f);
            }
        }
    }
    if (outSeeds) {
        char *p = strstr(resp, "\"numPeers\":");
        if (p) sscanf(p + 11, "%d", outSeeds);
    }
    if (outSpeedKb) {
        char *p = strstr(resp, "\"downloadSpeed\":");
        if (p) {
            int speedBps = 0;
            if (sscanf(p + 16, "%d", &speedBps) == 1) {
                *outSpeedKb = speedBps / 1024;
            }
        }
    }

    return true;
}
