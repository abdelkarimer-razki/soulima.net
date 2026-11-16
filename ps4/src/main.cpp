/**
 * Soulima PS4 Native Application — main.cpp
 *
 * True native 1080p OrbisOS cinema application rendering directly to the PS4 display
 * buffers via libSceVideoOut and controlled via DualShock 4 (libScePad).
 *
 * Features:
 *  - Full 10-foot TV Cinema Wall (Horizontal poster shelf & Hero spotlight)
 *  - D-Pad / Analog controller navigation with gold focus highlight
 *  - Integrated In-App Cinema Video Player (Zero browser launching)
 *  - Quality & Torrent selector modal (1080p / 720p / 4K)
 *  - Interactive on-screen IP configurator & live latency probe
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

    // Initial silent ping to streaming server
    network.TestConnection();

    AppView currentView = AppView::CinemaWall;
    FocusZone focus = FocusZone::PosterShelf;

    int activeCategory = 0; // 0 = Trending, 1 = Masterpieces, 2 = Series
    int selectedItem = 0;   // Selected card in active row
    int shelfScrollOffset = 0;
    int heroActionIdx = 0;  // 0 = Stream Now, 1 = Quality, 2 = Network
    int qualitySelectIdx = 0;
    int selectedOctet = 3;  // Focus on last octet (68) for IP editor

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

        // ==============================================================
        // INPUT PROCESSING BY VIEW
        // ==============================================================
        if (currentView == AppView::Player) {
            player.Update(&network);

            if (controller.Cross()) {
                player.TogglePlayPause();
            }
            if (controller.Right() || controller.R1()) {
                player.SeekRelative(15);
            }
            if (controller.Left() || controller.L1()) {
                player.SeekRelative(-15);
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
                // Start playback with chosen quality
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
                network.ip[selectedOctet] = (network.ip[selectedOctet] - 1 + 256) % 256;
            }
            if (controller.Square()) {
                network.TestConnection();
            }
            if (controller.Triangle()) {
                network.SaveConfig();
            }
            if (controller.Circle() || controller.Cross()) {
                currentView = AppView::CinemaWall;
            }
        }
        else if (currentView == AppView::CinemaWall) {
            int itemCount = catalog.GetItemCount(activeCategory);

            // Exit application with Circle if at root
            if (controller.Circle()) {
                shouldQuit = true;
                break;
            }

            // Quick Hotkeys
            if (controller.Square()) {
                currentView = AppView::QualityModal;
                qualitySelectIdx = 0;
            }
            if (controller.Triangle()) {
                currentView = AppView::NetworkSettings;
            }
            if (controller.L1()) {
                activeCategory = (activeCategory - 1 + catalog.GetCategoryCount()) % catalog.GetCategoryCount();
                selectedItem = 0;
                shelfScrollOffset = 0;
            }
            if (controller.R1()) {
                activeCategory = (activeCategory + 1) % catalog.GetCategoryCount();
                selectedItem = 0;
                shelfScrollOffset = 0;
            }

            if (focus == FocusZone::PosterShelf) {
                if (controller.Left()) {
                    if (selectedItem > 0) {
                        selectedItem--;
                        if (selectedItem < shelfScrollOffset) {
                            shelfScrollOffset = selectedItem;
                        }
                    }
                }
                if (controller.Right()) {
                    if (selectedItem < itemCount - 1) {
                        selectedItem++;
                        if (selectedItem >= shelfScrollOffset + 5) {
                            shelfScrollOffset = selectedItem - 4;
                        }
                    }
                }
                if (controller.Up()) {
                    focus = FocusZone::HeroActions;
                    heroActionIdx = 0;
                }
                if (controller.Cross()) {
                    // Start playback directly
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
                if (controller.Up()) {
                    focus = FocusZone::TopNav;
                }
                if (controller.Down()) {
                    focus = FocusZone::PosterShelf;
                }
                if (controller.Cross()) {
                    if (heroActionIdx == 0) {
                        // Stream Now
                        const MovieItem *item = catalog.GetItem(activeCategory, selectedItem);
                        if (item) {
                            player.Start(item->title, item->quality, item->magnet, &network);
                            currentView = AppView::Player;
                        }
                    } else if (heroActionIdx == 1) {
                        currentView = AppView::QualityModal;
                        qualitySelectIdx = 0;
                    } else if (heroActionIdx == 2) {
                        currentView = AppView::NetworkSettings;
                    }
                }
            }
            else if (focus == FocusZone::TopNav) {
                if (controller.Left()) {
                    activeCategory = (activeCategory - 1 + catalog.GetCategoryCount()) % catalog.GetCategoryCount();
                    selectedItem = 0;
                    shelfScrollOffset = 0;
                }
                if (controller.Right()) {
                    activeCategory = (activeCategory + 1) % catalog.GetCategoryCount();
                    selectedItem = 0;
                    shelfScrollOffset = 0;
                }
                if (controller.Down()) {
                    focus = FocusZone::HeroActions;
                }
            }
        }

        // ==============================================================
        // RENDER PASS (1080p, 60fps)
        // ==============================================================
        if (currentView == AppView::Player) {
            player.Render(&renderer);
            renderer.Flip();
            continue;
        }

        // Base Cinema Dark Canvas
        renderer.Clear(Color::Bg());

        // 1. TOP NAVIGATION BAR (0..80px)
        renderer.DrawRect(0, 0, 1920, 80, Color(16, 18, 25));
        renderer.DrawHLine(0, 80, 1920, Color::Gold());

        renderer.DrawText("SOULIMA CINEMA", 60, 24, 2, Color::Gold());
        renderer.DrawBadge("100% NATIVE PS4", 390, 26, Color::White(), Color::Crimson());

        // Category Tabs in Top Nav
        const char *tabNames[] = { "TRENDING", "MASTERPIECES", "SERIES" };
        int tabX = 660;
        for (int i = 0; i < 3; i++) {
            bool isTabActive = (activeCategory == i);
            bool isTabFocused = (focus == FocusZone::TopNav && activeCategory == i);

            Color tabColor = isTabFocused ? Color::Gold() : (isTabActive ? Color::White() : Color::Gray());
            Color tabBg = isTabFocused ? Color(40, 48, 68) : (isTabActive ? Color(28, 34, 46) : Color(0, 0, 0, 0));

            renderer.DrawRect(tabX, 22, 160, 40, tabBg);
            if (isTabFocused || isTabActive) {
                renderer.DrawOutlineRect(tabX, 22, 160, 40, 1, isTabFocused ? Color::Gold() : Color::PanelBorder());
            }
            renderer.DrawTextCentered(tabNames[i], tabX + 80, 34, 1, tabColor);
            tabX += 180;
        }

        // Live Server Node Status Badge
        if (network.status == ServerStatus::Online) {
            char statBuf[48];
            snprintf(statBuf, sizeof(statBuf), "ONLINE (%dms)", network.lastLatencyMs);
            renderer.DrawBadge(statBuf, 1660, 26, Color::White(), Color::Green());
        } else {
            renderer.DrawBadge("SERVER OFFLINE", 1660, 26, Color::White(), Color::Crimson());
        }

        // 2. HERO SPOTLIGHT BANNER (90..450px)
        const MovieItem *heroMovie = catalog.GetItem(activeCategory, selectedItem);
        if (heroMovie) {
            // Hero Backdrop container
            renderer.DrawGradientV(60, 100, 1800, 360, Color(26, 32, 46), Color(16, 19, 27));
            renderer.DrawOutlineRect(60, 100, 1800, 360, 1, Color::PanelBorder());

            // Genre & Quality Top Bar in Hero
            renderer.DrawBadge(heroMovie->genre, 90, 125, Color::Cyan(), Color(20, 25, 36));
            renderer.DrawBadge(heroMovie->quality, 320, 125, Color::White(), Color::Crimson());

            char ratingBuf[32];
            snprintf(ratingBuf, sizeof(ratingBuf), "* %s / 10", heroMovie->rating);
            renderer.DrawBadge(ratingBuf, 460, 125, Color::Gold(), Color(32, 28, 14));

            renderer.DrawText(heroMovie->year, 620, 131, 1, Color::Gray());
            renderer.DrawText("•", 680, 131, 1, Color::DarkGray());
            renderer.DrawText(heroMovie->duration, 700, 131, 1, Color::Gray());

            // Large Movie Title
            renderer.DrawText(heroMovie->title, 90, 175, 2, Color::White());

            // Synopsis overview
            renderer.DrawText(heroMovie->overview, 90, 230, 1, Color(190, 198, 210));

            // Hero Action Buttons
            const char *actions[] = { "[X] STREAM MOVIE", "[Square] QUALITIES", "[Triangle] SERVER IP" };
            int btnX = 90;
            for (int i = 0; i < 3; i++) {
                bool isBtnFocused = (focus == FocusZone::HeroActions && heroActionIdx == i);
                Color btnBg = isBtnFocused ? Color(50, 60, 85) : Color(28, 32, 44);
                Color btnBorder = isBtnFocused ? Color::Gold() : Color::PanelBorder();
                Color btnText = isBtnFocused ? Color::Gold() : Color::White();

                renderer.DrawRect(btnX, 390, 240, 48, btnBg);
                renderer.DrawOutlineRect(btnX, 390, 240, 48, isBtnFocused ? 2 : 1, btnBorder);
                renderer.DrawTextCentered(actions[i], btnX + 120, 406, 1, btnText);
                btnX += 265;
            }
        }

        // 3. HORIZONTAL POSTER SHELF (480..960px)
        renderer.DrawText(catalog.GetCategoryName(activeCategory), 60, 480, 1, Color::Gold());
        renderer.DrawText("• Use D-Pad Left/Right to browse, (X) to Play", 270, 480, 1, Color::Gray());

        int shelfY = 515;
        int cardW = 260;
        int cardH = 370;
        int cardSpacing = 40;
        int startX = 60;

        int totalInCat = catalog.GetItemCount(activeCategory);
        for (int i = 0; i < 6 && (shelfScrollOffset + i) < totalInCat; i++) {
            int actualIdx = shelfScrollOffset + i;
            const MovieItem *item = catalog.GetItem(activeCategory, actualIdx);
            if (!item) continue;

            bool isCardSelected = (focus == FocusZone::PosterShelf && selectedItem == actualIdx);
            int itemX = startX + (i * (cardW + cardSpacing));

            renderer.DrawMovieCard(itemX, shelfY, cardW, cardH,
                                   item->title, item->year, item->rating,
                                   item->genre, item->quality, isCardSelected);
        }

        // 4. FOOTER LEGEND BAR (1000..1080px)
        renderer.DrawRect(0, 1000, 1920, 80, Color(14, 16, 22));
        renderer.DrawHLine(0, 1000, 1920, Color::PanelBorder());

        renderer.DrawBadge("(X) Stream Movie", 80, 1020, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(Square) Change Quality", 320, 1020, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(Triangle) Server Settings", 610, 1020, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(L1 / R1) Category", 910, 1020, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(D-Pad) 10-Foot Navigation", 1160, 1020, Color::White(), Color(32, 38, 54));
        renderer.DrawBadge("(O) Exit App", 1470, 1020, Color::White(), Color(32, 38, 54));

        // ==============================================================
        // OVERLAY MODALS
        // ==============================================================
        if (currentView == AppView::QualityModal) {
            // Darkened backdrop tint
            renderer.DrawRect(0, 0, 1920, 1080, Color(0, 0, 0, 180));

            int modalW = 800;
            int modalH = 460;
            int modalX = (1920 - modalW) / 2;
            int modalY = (1080 - modalH) / 2;

            renderer.DrawGradientV(modalX, modalY, modalW, modalH, Color(28, 34, 48), Color(16, 18, 26));
            renderer.DrawOutlineRect(modalX, modalY, modalW, modalH, 2, Color::Gold());

            renderer.DrawTextCentered("SELECT TORRENT STREAM QUALITY", modalX + (modalW / 2), modalY + 30, 2, Color::Gold());
            renderer.DrawHLine(modalX, modalY + 70, modalW, Color::PanelBorder());

            const char *qualOptions[] = {
                "[1] 1080p BluRay Remux  •  2.8 GB  •  184 Seeds  •  High Bitrate",
                "[2] 720p WEB-DL x264    •  1.2 GB  •  92 Seeds   •  Instant Buffer",
                "[3] 2160p 4K UHD HDR    •  8.4 GB  •  210 Seeds  •  Maximum Fidelity"
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
            // Darkened backdrop tint
            renderer.DrawRect(0, 0, 1920, 1080, Color(0, 0, 0, 180));

            int modalW = 900;
            int modalH = 500;
            int modalX = (1920 - modalW) / 2;
            int modalY = (1080 - modalH) / 2;

            renderer.DrawGradientV(modalX, modalY, modalW, modalH, Color(28, 34, 48), Color(16, 18, 26));
            renderer.DrawOutlineRect(modalX, modalY, modalW, modalH, 2, Color::Gold());

            renderer.DrawTextCentered("STREAMING SERVER NETWORK CONFIGURATION", modalX + (modalW / 2), modalY + 30, 2, Color::Gold());
            renderer.DrawHLine(modalX, modalY + 70, modalW, Color::PanelBorder());

            renderer.DrawText("Adjust target PC server IP address using DualShock 4 Controller:", modalX + 60, modalY + 110, 1, Color::Gray());

            // 4 Octets
            int octetX = modalX + 110;
            int octetY = modalY + 160;
            for (int i = 0; i < 4; i++) {
                bool isCurrent = (selectedOctet == i);
                Color boxBg = isCurrent ? Color(48, 58, 82) : Color(24, 28, 38);
                Color boxBorder = isCurrent ? Color::Gold() : Color::PanelBorder();
                Color txtColor = isCurrent ? Color::Gold() : Color::White();

                renderer.DrawRect(octetX, octetY, 110, 60, boxBg);
                renderer.DrawOutlineRect(octetX, octetY, 110, 60, isCurrent ? 3 : 1, boxBorder);

                char valBuf[16];
                snprintf(valBuf, sizeof(valBuf), "%d", network.ip[i]);
                renderer.DrawTextCentered(valBuf, octetX + 55, octetY + 18, 2, txtColor);

                if (i < 3) {
                    renderer.DrawText(".", octetX + 118, octetY + 18, 2, Color::Gray());
                    octetX += 140;
                } else {
                    octetX += 120;
                }
            }
            renderer.DrawText(": 3030", octetX + 10, octetY + 18, 2, Color::Cyan());

            // Status message
            renderer.DrawText("Connection Status:", modalX + 60, modalY + 260, 1, Color::Gray());
            renderer.DrawText(network.statusMessage, modalX + 240, modalY + 260, 1, network.status == ServerStatus::Online ? Color::Green() : Color::Crimson());

            renderer.DrawText("[D-Pad Left/Right] Select Octet     [D-Pad Up/Down] Increment/Decrement", modalX + 60, modalY + 320, 1, Color::Cyan());
            renderer.DrawText("[Square] Test Ping Connection       [Triangle] Save to /data/soulima.conf", modalX + 60, modalY + 355, 1, Color::Gold());
            renderer.DrawTextCentered("Press (O) Circle to Close Settings", modalX + (modalW / 2), modalY + 430, 1, Color::Gray());
        }

        renderer.Flip();
    }

    return 0;
}
