/**
 * Soulima PS4 Launcher — main.c
 *
 * Minimal PS4 homebrew eboot that launches the Soulima streaming
 * web UI in the PS4's WebKit browser (fullscreen).
 *
 * Target: x86_64-scei-ps4 (OrbisOS / FreeBSD-derived)
 * Toolchain: OpenOrbis PS4 Toolchain (clang/lld)
 *
 * Configure the server URL at compile time via -DSOULIMA_URL="..."
 * or by editing this file. The soulima.conf in the pkg root is for
 * documentation / runtime reference; the URL is baked at compile time
 * because OrbisOS has no general-purpose file I/O for homebrew without
 * extra libraries.
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>

/* ------------------------------------------------------------------ */
/* Compile-time configuration                                          */
/* ------------------------------------------------------------------ */
#ifndef SOULIMA_URL
#define SOULIMA_URL "http://192.168.1.100:3030"
#endif

/* ------------------------------------------------------------------ */
/* PS4 OrbisOS system-service declarations                             */
/* These are resolved at link time against the OpenOrbis stub libs.    */
/* ------------------------------------------------------------------ */

/* Hide the initial splash / loading screen shown by the firmware. */
int32_t sceSystemServiceHideSplashScreen(void);

/**
 * Launch a URL in the PS4 system WebKit browser (Webkit2).
 *  url   – null-terminated URL string
 *  param – reserved; pass NULL for default behaviour (fullscreen)
 * Returns 0 on success, negative SCE error code on failure.
 */
int32_t sceSystemServiceLaunchWebBrowser(const char *url, void *param);

/* Receive / drain system-service events (keeps the process responsive). */
typedef struct {
    uint32_t type;
    uint8_t  data[128];
} SceSystemServiceEvent;

void sceSystemServiceReceiveEvent(SceSystemServiceEvent *event);

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */
int main(void)
{
    /* Step 1 – dismiss the firmware loading screen */
    sceSystemServiceHideSplashScreen();

    /* Step 2 – open Soulima in the system browser (fullscreen by default) */
    const char *url = SOULIMA_URL;
    int32_t ret = sceSystemServiceLaunchWebBrowser(url, NULL);
    (void)ret;   /* non-fatal – browser may already be open */

    /*
     * Step 3 – idle loop
     *
     * The process must stay alive while the browser is open; exiting
     * early causes the firmware to close the browser and return to XMB.
     * We drain system events so the firmware doesn't consider us hung.
     */
    SceSystemServiceEvent ev;
    while (1) {
        memset(&ev, 0, sizeof(ev));
        sceSystemServiceReceiveEvent(&ev);

        /*
         * Event type 0x10000 == user closed the app from XMB.
         * Any non-zero type we don't recognise — just keep running.
         */
        if (ev.type == 0x10000) {
            break;
        }

        /* Yield — equivalent of usleep(16000) on OrbisOS */
        __asm__ volatile("pause");
    }

    return 0;
}
