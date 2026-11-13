/**
 * stub_shims.c — dummy implementations of PS4 syscall stubs.
 *
 * Used ONLY for the host-clang stub build (make stub).
 * These are never linked into the real PS4 eboot.bin — there they
 * come from the OpenOrbis *_stub_weak libraries.
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

typedef struct {
    uint32_t type;
    uint8_t  data[128];
} SceSystemServiceStatus;

int32_t sceSystemServiceHideSplashScreen(void)
{
    fprintf(stderr, "[stub] sceSystemServiceHideSplashScreen()\n");
    return 0;
}

int32_t sceSystemServiceLaunchWebBrowser(const char *url, void *param)
{
    fprintf(stderr, "[stub] sceSystemServiceLaunchWebBrowser(\"%s\", %p)\n",
            url ? url : "(null)", param);
    return 0;
}

int32_t sceSystemServiceReceiveEvent(SceSystemServiceStatus *status)
{
    if (status) {
        memset(status, 0, sizeof(*status));
        /* Simulate exit after a brief moment so the stub terminates */
        static int calls = 0;
        if (++calls > 60) {
            status->type = 0x10000; /* exit request */
        }
    }
    usleep(16000);
    return 0;
}

int32_t sceKernelUsleep(uint32_t microseconds)
{
    return (int32_t)usleep(microseconds);
}
