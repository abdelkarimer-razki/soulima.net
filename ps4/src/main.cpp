/**
 * Soulima PS4 Native Application — main.cpp
 *
 * True native 1080p OrbisOS cinema application rendering directly to the PS4 display
 * buffers via libSceVideoOut and controlled via DualShock 4 (libScePad).
 *
 * Features:
 *  - 1:1 Match with Soulima Web UI & Netflix-Style 10-foot experience
 *  - Real TMDB movie posters, backdrops, and Soulima white brand logo
 *  - Horizontal poster shelves with 2:3 aspect ratio cards and gold focus glow
 *  - Hero Billboard Spotlight with backdrop fade, ratings, genres, and synopsis
 *  - In-App Cinema Video Player with real video decoding, audio, seeking (+/-15s)
 *  - Dynamic server catalog and multi-source torrent resolver
 */

#include "renderer.h"
#include "controller.h"
#include "network.h"
#include "catalog.h"
#include "player.h"
#include <stdio.h>
#include <string.h>

#ifndef SOULIMA_HOST
extern "C" {
    int32_t sceSystemServiceHideSplashScreen(void);
}
#endif

enum class AppView {
    CinemaWall,
    QualityModal,
    Player,
    NetworkSettings
};

enum class FocusZone {
    TopNav,
    HeroActions,
    PosterShelf
};

static Texture *FindAndLoadTexture(Renderer &renderer, const char *filename) {
    const char *paths[] = { "assets/", "ps4/assets/", "/app0/assets/", "" };
    for (const char *p : paths) {
        char full[128];
        snprintf(full, sizeof(full), "%s%s", p, filename);
        Texture *t = renderer.LoadTexture(full);
        if (t) return t;
    }
    return nullptr;
}

int main(void)
{
#ifndef SOULIMA_HOST
    // Dismiss the firmware loading splash screen immediately
    sceSystemServiceHideSplashScreen();
#endif

    Renderer renderer;
    if (!renderer.Init()) {
        return 1;
    }

    Controller controller;
    if (!controller.Init()) {
        return 1;
    }

    NetworkManager network;
    network.LoadConfig();

    CatalogManager catalog;
    CinemaPlayer player;

    // Load brand assets
    Texture *logoTex = FindAndLoadTexture(renderer, "logo.png");
    Texture *backdropTex = FindAndLoadTexture(renderer, "backdrop_default.jpg");

    // Initialize catalog and textures
    catalog.Init(&renderer);

    // Initial ping to streaming server
    network.TestConnection();
    if (network.status == ServerStatus::Online) {
        catalog.FetchFromNetwork(&network, &renderer);
    }

    AppView currentView = AppView::CinemaWall;
    FocusZone focus = FocusZone::PosterShelf;

    int activeCategory = 0; // 0 = Trending, 1 = Masterpieces, 2 = Series
    int selectedItem = 0;   // Selected card in active row
    int shelfScrollOffset = 0;
    int heroActionIdx = 0;  // 0 = Stream Now, 1 = Quality, 2 = Network
    int qualitySelectIdx = 0;
    int selectedOctet = 3;  // Focus on last octet (68) for IP editor
    int networkCheckCounter = 0;

    bool shouldQuit = false;

    while (!shouldQuit) {
        controller.Update();
        if (controller.QuitRequested()) {
            shouldQuit = true;
            break;
        }

        // Global hotkey: Options to toggle Network Settings
        if (controller.Options()) {
            if (currentView == AppView::NetworkSettings) {
                currentView = AppView::CinemaWall;
            } else if (currentView != AppView::Player) {
                currentView = AppView::NetworkSettings;
            }
        }

        // Periodic network check
        networkCheckCounter++;
        if (networkCheckCounter % 300 == 0) { // Every 5 seconds
            network.TestConnection();
        }

        // ==============================================================
        // INPUT PROCESSING BY VIEW
        // ==============================================================
        if (currentView == AppView::Player) {
            player.Update(&network);

            if (controller.Cross()) {
                player.TogglePlayPause();
            }
            if (controller.Right() || controller.R1()) {
                player.SeekRelative(15, &network);
            }
            if (controller.Left() || controller.L1()) {
                player.SeekRelative(-15, &network);
            }
            if (controller.Circle()) {
                player.Stop();
                currentView = AppView::CinemaWall;
            }
        }
        else if (currentView == AppView::QualityModal) {
            if (controller.Up()) {
                if (qualitySelectIdx > 0) qualitySelectIdx--;
            }
            if (controller.Down()) {
                if (qualitySelectIdx < 2) qualitySelectIdx++;
            }
            if (controller.Cross()) {
                const MovieItem *item = catalog.GetItem(activeCategory, selectedItem);
                if (item) {
                    const char *qualNames[] = { "1080p BluRay", "720p Fast WEB", "2160p 4K UHD" };
                    player.Start(item->title, qualNames[qualitySelectIdx], item->magnet, &network);
                    currentView = AppView::Player;
                }
            }
            if (controller.Circle() || controller.Square()) {
                currentView = AppView::CinemaWall;
            }
        }
        else if (currentView == AppView::NetworkSettings) {
            if (controller.Left()) {
                if (selectedOctet > 0) selectedOctet--;
            }
            if (controller.Right()) {
                if (selectedOctet < 3) selectedOctet++;
            }
            if (controller.Up()) {
                network.ip[selectedOctet] = (network.ip[selectedOctet] + 1) % 256;
            }
            if (controller.Down()) {
                network.ip[selectedOctet] = (network.ip[selectedOctet] == 0) ? 255 : (network.ip[selectedOctet] - 1);
            }
            if (controller.Cross()) {
                network.SaveConfig();
                network.TestConnection();
                catalog.FetchFromNetwork(&network, &renderer);
                currentView = AppView::CinemaWall;
            }
            if (controller.Triangle()) {
                network.TestConnection();
            }
            if (controller.Circle()) {
                currentView = AppView::CinemaWall;
            }
        }
        else if (currentView == AppView::CinemaWall) {
            // L1 / R1 cycle through main Categories
            if (controller.L1()) {
                if (activeCategory > 0) {
                    activeCategory--;
                    selectedItem = 0;
                    shelfScrollOffset = 0;
                }
            }
            if (controller.R1()) {
                if (activeCategory < catalog.GetCategoryCount() - 1) {
                    activeCategory++;
                    selectedItem = 0;
                    shelfScrollOffset = 0;
                }
            }

            // Quick Hotkeys
            if (controller.Square()) {
                currentView = AppView::QualityModal;
            }
            if (controller.Triangle()) {
                currentView = AppView::NetworkSettings;
            }

            // Navigation by Focus Zone
            if (focus == FocusZone::PosterShelf) {
                int totalInCat = catalog.GetItemCount(activeCategory);

                if (controller.Left()) {
                    if (selectedItem > 0) {
                        selectedItem--;
                        if (selectedItem < shelfScrollOffset) {
                            shelfScrollOffset = selectedItem;
                        }
                    }
                }
                if (controller.Right()) {
                    if (selectedItem < totalInCat - 1) {
                        selectedItem++;
                        if (selectedItem >= shelfScrollOffset + 5) {
                            shelfScrollOffset = selectedItem - 4;
                        }
                    }
                }
                if (controller.Up()) {
                    focus = FocusZone::HeroActions;
                }
                if (controller.Down()) {
                    // Cycle down to next row
                    if (activeCategory < catalog.GetCategoryCount() - 1) {
                        activeCategory++;
                        selectedItem = 0;
                        shelfScrollOffset = 0;
                    }
                }
                if (controller.Cross()) {
                    const MovieItem *item = catalog.GetItem(activeCategory, selectedItem);
                    if (item) {
                        player.Start(item->title, item->quality, item->magnet, &network);
                        currentView = AppView::Player;
                    }
                }
            }
            else if (focus == FocusZone::HeroActions) {
                if (controller.Left()) {
                    if (heroActionIdx > 0) heroActionIdx--;
                }
                if (controller.Right()) {
                    if (heroActionIdx < 2) heroActionIdx++;
                }
                if (controller.Down()) {
                    focus = FocusZone::PosterShelf;
                }
                if (controller.Cross()) {
                    if (heroActionIdx == 0) {
                        const MovieItem *item = catalog.GetItem(activeCategory, selectedItem);
                        if (item) {
                            player.Start(item->title, item->quality, item->magnet, &network);
                            currentView = AppView::Player;
                        }
                    } else if (heroActionIdx == 1) {
                        currentView = AppView::QualityModal;
                    } else if (heroActionIdx == 2) {
                        currentView = AppView::NetworkSettings;
                    }
                }
            }
        }

        // ==============================================================
        // RENDER PIPELINE
        // ==============================================================
        if (currentView == AppView::Player) {
            player.Render(&renderer);
            renderer.Flip();
            continue;
        }

        renderer.Clear(Color::Bg());

        // 1. HERO BACKDROP SPOTLIGHT (0..480px)
        if (backdropTex) {
            renderer.DrawTextureFadedV(backdropTex, 0, 40, 1920, 440);
        }

        // 2. TOP NAVIGATION BAR (0..70px)
        renderer.DrawGradientV(0, 0, 1920, 70, Color(10, 10, 14, 240), Color(10, 10, 14, 180));
        renderer.DrawHLine(0, 70, 1920, Color::PanelBorder());

        if (logoTex) {
            renderer.DrawTexture(logoTex, 60, 16, 120, 36);
        } else {
            renderer.DrawText("SOULIMA", 60, 24, 2, Color::Gold());
        }

        // Navigation Tabs (Movies, Series, Downloads)
        const char *tabs[] = { "MOVIES", "SERIES", "DOWNLOADS" };
        int tabX = 240;
        for (int i = 0; i < 3; i++) {
            bool isTabActive = (activeCategory == i);
            renderer.DrawText(tabs[i], tabX, 26, 1, isTabActive ? Color::Gold() : Color::Gray());
            if (isTabActive) {
                renderer.DrawHLine(tabX, 48, (int)strlen(tabs[i]) * 8, Color::Gold());
            }
            tabX += 130;
        }

        // Server Status Indicator
        if (network.status == ServerStatus::Online) {
            char statBuf[48];
            snprintf(statBuf, sizeof(statBuf), "ONLINE (%dms)", network.lastLatencyMs);
            renderer.DrawBadge(statBuf, 1660, 20, Color::White(), Color::Green());
        } else {
            renderer.DrawBadge("OFFLINE", 1660, 20, Color::White(), Color::Crimson());
        }

        // 3. HERO MOVIE SPOTLIGHT OVERLAY
        const MovieItem *heroMovie = catalog.GetItem(activeCategory, selectedItem);
        if (heroMovie) {
            int heroY = 110;

            // Genre & Rating Badges
            char ratingBuf[32];
            snprintf(ratingBuf, sizeof(ratingBuf), "* %s / 10", heroMovie->rating);
            renderer.DrawBadge(ratingBuf, 80, heroY, Color::Gold(), Color(32, 28, 14));
            renderer.DrawBadge(heroMovie->genre, 220, heroY, Color::Cyan(), Color(20, 25, 36));
            renderer.DrawBadge(heroMovie->quality, 440, heroY, Color::White(), Color::Crimson());

            renderer.DrawText(heroMovie->year, 600, heroY + 6, 1, Color::Gray());
            renderer.DrawText("•", 655, heroY + 6, 1, Color::DarkGray());
            renderer.DrawText(heroMovie->duration, 675, heroY + 6, 1, Color::Gray());

            // Movie Title in bold
            renderer.DrawText(heroMovie->title, 80, heroY + 45, 2, Color::White());

            // Synopsis Overview (wrapped)
            renderer.DrawText(heroMovie->overview, 80, heroY + 105, 1, Color(200, 205, 215));

            // Hero Buttons: [PLAY STREAM] [QUALITY] [SERVER IP]
            const char *actions[] = { "[X] PLAY STREAM", "[Square] QUALITY", "[Triangle] SERVER IP" };
            int btnX = 80;
            int btnY = heroY + 240;
            for (int i = 0; i < 3; i++) {
                bool isBtnFocused = (focus == FocusZone::HeroActions && heroActionIdx == i);
                Color btnBg = isBtnFocused ? Color::White() : Color(28, 32, 44);
                Color btnBorder = isBtnFocused ? Color::Gold() : Color::PanelBorder();
                Color btnText = isBtnFocused ? Color(10, 10, 14) : Color::White();

                renderer.DrawRect(btnX, btnY, 220, 46, btnBg);
                renderer.DrawOutlineRect(btnX, btnY, 220, 46, isBtnFocused ? 2 : 1, btnBorder);
                renderer.DrawTextCentered(actions[i], btnX + 110, btnY + 16, 1, btnText);
                btnX += 245;
            }
        }

        // 4. HORIZONTAL MOVIE POSTER SHELF (470..960px)
        int shelfTitleY = 470;
        renderer.DrawText(catalog.GetCategoryName(activeCategory), 80, shelfTitleY, 1, Color::Gold());
        renderer.DrawText("• Use D-Pad Left/Right to browse, (X) to Stream", 310, shelfTitleY, 1, Color::Gray());

        int shelfY = 505;
        int cardW = 200;
        int cardH = 300;
        int cardSpacing = 28;
        int startX = 80;

        int totalInCat = catalog.GetItemCount(activeCategory);
        for (int i = 0; i < 6 && (shelfScrollOffset + i) < totalInCat; i++) {
            int actualIdx = shelfScrollOffset + i;
            const MovieItem *item = catalog.GetItem(activeCategory, actualIdx);
            if (!item) continue;

            bool isCardSelected = (focus == FocusZone::PosterShelf && selectedItem == actualIdx);
            int itemX = startX + (i * (cardW + cardSpacing));

            renderer.DrawMoviePosterCard(itemX, shelfY, cardW, cardH,
                                         item->posterTex, item->title, item->year, item->rating,
                                         isCardSelected);
        }

        // 5. FOOTER CONTROLLER PROMPTS (1000..1080px)
        renderer.DrawRect(0, 1010, 1920, 70, Color(12, 14, 20));
        renderer.DrawHLine(0, 1010, 1920, Color::PanelBorder());

        renderer.DrawBadge("(X) Stream Now", 80, 1025, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(Square) Change Quality", 290, 1025, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(Triangle) Server Settings", 560, 1025, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(L1 / R1) Category", 840, 1025, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(D-Pad) 10-Foot Navigation", 1080, 1025, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(O) Exit App", 1390, 1025, Color::White(), Color(32, 38, 54));

        // ==============================================================
        // OVERLAY MODALS
        // ==============================================================
        if (currentView == AppView::QualityModal) {
            renderer.DrawRect(0, 0, 1920, 1080, Color(0, 0, 0, 190));

            int modalW = 800;
            int modalH = 460;
            int modalX = (1920 - modalW) / 2;
            int modalY = (1080 - modalH) / 2;

            renderer.DrawGradientV(modalX, modalY, modalW, modalH, Color(24, 28, 40), Color(14, 16, 24));
            renderer.DrawOutlineRect(modalX, modalY, modalW, modalH, 2, Color::Gold());

            renderer.DrawTextCentered("SELECT TORRENT STREAM QUALITY", modalX + (modalW / 2), modalY + 30, 2, Color::Gold());
            renderer.DrawHLine(modalX, modalY + 70, modalW, Color::PanelBorder());

            const char *qualOptions[] = {
                "[1] 1080p BluRay Remux  •  2.8 GB  •  High Bitrate P2P",
                "[2] 720p WEB-DL x264    •  1.2 GB  •  Fast Buffering",
                "[3] 2160p 4K UHD HDR    •  8.4 GB  •  Maximum Fidelity"
            };

            for (int i = 0; i < 3; i++) {
                bool isQSelected = (qualitySelectIdx == i);
                int qY = modalY + 110 + (i * 90);

                Color qBg = isQSelected ? Color(48, 58, 82) : Color(24, 28, 38);
                Color qBorder = isQSelected ? Color::Gold() : Color::PanelBorder();
                Color qText = isQSelected ? Color::Gold() : Color::White();

                renderer.DrawRect(modalX + 40, qY, modalW - 80, 70, qBg);
                renderer.DrawOutlineRect(modalX + 40, qY, modalW - 80, 70, isQSelected ? 2 : 1, qBorder);
                renderer.DrawText(qualOptions[i], modalX + 70, qY + 26, 1, qText);
            }

            renderer.DrawTextCentered("Press (X) to Start Torrent Stream  |  (O) Cancel", modalX + (modalW / 2), modalY + 400, 1, Color::Gray());
        }
        else if (currentView == AppView::NetworkSettings) {
            renderer.DrawRect(0, 0, 1920, 1080, Color(0, 0, 0, 190));

            int modalW = 900;
            int modalH = 500;
            int modalX = (1920 - modalW) / 2;
            int modalY = (1080 - modalH) / 2;

            renderer.DrawGradientV(modalX, modalY, modalW, modalH, Color(24, 28, 40), Color(14, 16, 24));
            renderer.DrawOutlineRect(modalX, modalY, modalW, modalH, 2, Color::Gold());

            renderer.DrawTextCentered("STREAMING SERVER NETWORK CONFIGURATION", modalX + (modalW / 2), modalY + 30, 2, Color::Gold());
            renderer.DrawHLine(modalX, modalY + 70, modalW, Color::PanelBorder());

            renderer.DrawText("Adjust target PC server IP address using DualShock 4 Controller:", modalX + 60, modalY + 110, 1, Color::Gray());

            int octetX = modalX + 110;
            int octetY = modalY + 160;
            for (int i = 0; i < 4; i++) {
                bool isCurrent = (selectedOctet == i);
                Color boxBg = isCurrent ? Color(48, 58, 82) : Color(24, 28, 38);
                Color boxBorder = isCurrent ? Color::Gold() : Color::PanelBorder();
                Color txtColor = isCurrent ? Color::Gold() : Color::White();

                renderer.DrawRect(octetX, octetY, 110, 60, boxBg);
                renderer.DrawOutlineRect(octetX, octetY, 110, 60, isCurrent ? 2 : 1, boxBorder);

                char numBuf[8];
                snprintf(numBuf, sizeof(numBuf), "%d", network.ip[i]);
                renderer.DrawTextCentered(numBuf, octetX + 55, octetY + 20, 2, txtColor);

                if (i < 3) {
                    renderer.DrawText(".", octetX + 128, octetY + 20, 2, Color::Gray());
                }
                octetX += 165;
            }

            char curUrl[128];
            snprintf(curUrl, sizeof(curUrl), "Target URL: %s", network.GetUrl());
            renderer.DrawText(curUrl, modalX + 60, modalY + 260, 1, Color::Cyan());
            renderer.DrawText(network.statusMessage, modalX + 60, modalY + 295, 1,
                              (network.status == ServerStatus::Online) ? Color::Green() : Color::Crimson());

            renderer.DrawTextCentered("D-Pad Left/Right: Select Octet  |  Up/Down: Change Number", modalX + (modalW / 2), modalY + 380, 1, Color::Gray());
            renderer.DrawTextCentered("(X) Save & Connect  |  (Triangle) Test Ping  |  (O) Cancel", modalX + (modalW / 2), modalY + 420, 1, Color::Gold());
        }

        renderer.Flip();
    }

    if (logoTex) delete logoTex;
    if (backdropTex) delete backdropTex;

    return 0;
}
