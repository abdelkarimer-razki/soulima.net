/**
 * Soulima PS4 Launcher — main_full.c
 *
 * Full-featured version using established OpenOrbis homebrew patterns.
 * Follows the template from OpenOrbis sample apps and Al-Azif payload
 * samples: proper crt0 linkage, error reporting via libSceVideoOut
 * stub, and a clean event loop.
 *
 * References:
 *   https://github.com/OpenOrbis/OpenOrbis-PS4-Toolchain (samples/)
 *   https://github.com/Al-Azif/ps4-payload-samples
 *
 * Build with the OpenOrbis Makefile in this directory (see Makefile).
 */

#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>

/* ------------------------------------------------------------------ */
/* Compile-time configuration                                          */
/* ------------------------------------------------------------------ */
#ifndef SOULIMA_URL
#define SOULIMA_URL "http://192.168.1.100:3030"
#endif

#define SOULIMA_APP_VERSION  "1.00"
#define SOULIMA_TITLE_ID     "SOUL00001"

/* ------------------------------------------------------------------ */
/* PS4 / OrbisOS type aliases                                          */
/* ------------------------------------------------------------------ */
typedef int32_t  SceInt32;
typedef uint32_t SceUInt32;
typedef int      SceBoolean;

/* ------------------------------------------------------------------ */
/* System service                                                      */
/* ------------------------------------------------------------------ */
typedef struct SceSystemServiceStatus {
    SceInt32  eventType;        /* 0x10000 = exit request */
    SceInt32  : 32;
    SceInt32  : 32;
    SceInt32  : 32;
    uint8_t   reserved[112];
} SceSystemServiceStatus;

SceInt32 sceSystemServiceHideSplashScreen(void);
SceInt32 sceSystemServiceLaunchWebBrowser(const char *url, void *param);
SceInt32 sceSystemServiceReceiveEvent(SceSystemServiceStatus *status);

/* ------------------------------------------------------------------ */
/* Kernel / libkernel helpers (provided by OpenOrbis crt0)            */
/* ------------------------------------------------------------------ */
/* sceKernelUsleep — suspend for microseconds */
SceInt32 sceKernelUsleep(SceUInt32 microseconds);

/* ------------------------------------------------------------------ */
/* Debug printf via UART — only works on debug/devkit consoles or     */
/* via klog kernel extension (GoldHEN provides this)                  */
/* ------------------------------------------------------------------ */
/* klog_write is provided by libdebug in OpenOrbis (optional) */
#ifdef ENABLE_KLOG
extern void klog_write(const char *fmt, ...);
#define DPRINTF(fmt, ...) klog_write("[Soulima] " fmt, ##__VA_ARGS__)
#else
#define DPRINTF(fmt, ...) ((void)0)
#endif

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * launch_browser — open the given URL in the system browser.
 * Retries up to `retries` times with 500 ms between attempts,
 * since the browser subsystem may still be initialising on cold boot.
 */
static SceInt32 launch_browser(const char *url, int retries)
{
    SceInt32 ret = -1;
    for (int i = 0; i < retries; i++) {
        ret = sceSystemServiceLaunchWebBrowser(url, NULL);
        DPRINTF("sceSystemServiceLaunchWebBrowser(\"%s\") = 0x%08X\n", url, ret);
        if (ret == 0) {
            return 0;
        }
        sceKernelUsleep(500000); /* 500 ms */
    }
    return ret;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */
int main(void)
{
    DPRINTF("Soulima %s (%s) starting\n", SOULIMA_APP_VERSION, SOULIMA_TITLE_ID);

    /* Dismiss the firmware splash / loading screen */
    sceSystemServiceHideSplashScreen();

    /* Brief pause so the system browser daemon is ready */
    sceKernelUsleep(500000);

    /* Open the Soulima web UI */
    const char *url = SOULIMA_URL;
    SceInt32 ret = launch_browser(url, 5 /* retry attempts */);
    if (ret != 0) {
        DPRINTF("Failed to open browser after retries: 0x%08X\n", ret);
        /*
         * Non-fatal — the app stays open so the user can exit cleanly
         * via the PS button rather than getting a crash dialog.
         */
    }

    DPRINTF("Browser launched. Entering idle loop.\n");

    /* ----------------------------------------------------------------
     * Event loop — keep the process alive while the browser is active.
     * When the user presses PS and closes the app the firmware sends
     * event 0x10000 (exit request); we honour it and exit cleanly.
     * ---------------------------------------------------------------- */
    SceSystemServiceStatus status;
    for (;;) {
        memset(&status, 0, sizeof(status));
        SceInt32 ev_ret = sceSystemServiceReceiveEvent(&status);

        if (ev_ret >= 0 && status.eventType == 0x10000) {
            DPRINTF("Exit event received. Shutting down.\n");
            break;
        }

        /* ~16 ms tick (≈ 60 Hz); prevents busy-wait from burning a core */
        sceKernelUsleep(16000);
    }

    DPRINTF("Soulima exiting cleanly.\n");
    return 0;
}
