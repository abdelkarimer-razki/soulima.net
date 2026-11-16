#include "catalog.h"
#include "network.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

CatalogManager::CatalogManager()
{
    memset(itemCounts, 0, sizeof(itemCounts));
    memset(items, 0, sizeof(items));
}

CatalogManager::~CatalogManager()
{
    for (int c = 0; c < MAX_CATEGORIES; c++) {
        for (int i = 0; i < itemCounts[c]; i++) {
            if (items[c][i].posterTex) {
                delete items[c][i].posterTex;
                items[c][i].posterTex = nullptr;
            }
        }
    }
}

void CatalogManager::LoadPosterTexture(MovieItem &item, Renderer *renderer, NetworkManager *net)
{
    if (item.posterTex || !renderer) return;

    // Check multiple potential paths
    const char *prefixes[] = { "assets/", "ps4/assets/", "/app0/assets/", "" };
    for (const char *prefix : prefixes) {
        char path[128];
        snprintf(path, sizeof(path), "%s%s", prefix, item.posterFilename);
        Texture *t = renderer->LoadTexture(path);
        if (t) {
            item.posterTex = t;
            return;
        }
    }

    // If not found locally, try downloading via NetworkManager from server /api/image
    if (net && item.posterFilename[0]) {
        char reqPath[128];
        snprintf(reqPath, sizeof(reqPath), "/api/image?path=/%s", item.posterFilename);
        uint8_t *imgData = nullptr;
        size_t imgSize = 0;
        if (net->DownloadImage(reqPath, &imgData, &imgSize) && imgData) {
            Texture *t = renderer->LoadTextureFromMemory(imgData, imgSize);
            free(imgData);
            if (t) {
                item.posterTex = t;
                return;
            }
        }
    }
}

void CatalogManager::Init(Renderer *renderer)
{
    // ==============================================================
    // CATEGORY 0: TRENDING MOVIES
    // ==============================================================
    strncpy(categoryNames[0], "TRENDING MOVIES", sizeof(categoryNames[0]) - 1);
    itemCounts[0] = 4;

    // 0: The Odyssey
    {
        MovieItem &m = items[0][0];
        m.id = 1368337;
        strncpy(m.title, "The Odyssey", sizeof(m.title) - 1);
        strncpy(m.year, "2026", sizeof(m.year) - 1);
        strncpy(m.rating, "8.0", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 30m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Action / Adventure", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p BluRay", sizeof(m.quality) - 1);
        strncpy(m.overview, "Odysseus, legendary King of Ithaca, embarks on a perilous journey home following the Trojan War, confronting the whims of the gods.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:1c6b2179bcd73efd07fb8018268598c062cf95af&dn=The.Odyssey.2026&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "5rhTDKUhPYvpdQIijFIs5VoWsON.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 120;
        m.peers = 35;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 1: The Beast
    {
        MovieItem &m = items[0][1];
        m.id = 918008;
        strncpy(m.title, "The Beast", sizeof(m.title) - 1);
        strncpy(m.year, "2024", sizeof(m.year) - 1);
        strncpy(m.rating, "7.5", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 26m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Drama", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p WEB", sizeof(m.quality) - 1);
        strncpy(m.overview, "In the near future where artificial intelligence reigns, human emotions have become a threat. A woman decides to purify her DNA by diving into past lives.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:3c19a9f4c330f81d89851eb7285a2283e5fa80c8&dn=The.Beast.2024&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "ocg5JfJP19fodcv5uQUApkmZMdI.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 88;
        m.peers = 19;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 2: Avengers: Doomsday
    {
        MovieItem &m = items[0][2];
        m.id = 1003596;
        strncpy(m.title, "Avengers: Doomsday", sizeof(m.title) - 1);
        strncpy(m.year, "2026", sizeof(m.year) - 1);
        strncpy(m.rating, "8.5", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 45m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Action / Sci-Fi", sizeof(m.genre) - 1);
        strncpy(m.quality, "4K UHD", sizeof(m.quality) - 1);
        strncpy(m.overview, "The Avengers assemble to confront Doctor Doom as the multiverse collapses into battleworld.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:92c81729dd756be303530c33a95781a73315a639&dn=Avengers.Doomsday.2026&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "1zqWkLwC1zLBBBtIWzmkmWeMWnT.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 350;
        m.peers = 95;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 3: The Hunger Games: Sunrise on the Reaping
    {
        MovieItem &m = items[0][3];
        m.id = 1299652;
        strncpy(m.title, "The Hunger Games", sizeof(m.title) - 1);
        strncpy(m.year, "2026", sizeof(m.year) - 1);
        strncpy(m.rating, "8.2", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 20m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Action / Sci-Fi", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p BluRay", sizeof(m.quality) - 1);
        strncpy(m.overview, "The story of the 50th Annual Hunger Games, the Second Quarter Quell, won by Haymitch Abernathy.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:ec34c231dde3e92d8d26a17c223152c8541295aa&dn=Hunger.Games&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "jNcZH8yplxttRlf0wwqfGGMKHxX.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 210;
        m.peers = 42;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // ==============================================================
    // CATEGORY 1: TOP RATED MASTERPIECES
    // ==============================================================
    strncpy(categoryNames[1], "TOP RATED MASTERPIECES", sizeof(categoryNames[1]) - 1);
    itemCounts[1] = 4;

    // 0: Inception
    {
        MovieItem &m = items[1][0];
        m.id = 27205;
        strncpy(m.title, "Inception", sizeof(m.title) - 1);
        strncpy(m.year, "2010", sizeof(m.year) - 1);
        strncpy(m.rating, "8.8", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 28m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Thriller", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p BluRay", sizeof(m.quality) - 1);
        strncpy(m.overview, "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:1c6b2179bcd73efd07fb8018268598c062cf95af&dn=Inception.2010.1080p.BluRay.DDP5.1.x265.10bit-GalaxyRG265%5BTGx%5D&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "inception.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 320;
        m.peers = 65;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 1: Interstellar
    {
        MovieItem &m = items[1][1];
        m.id = 157336;
        strncpy(m.title, "Interstellar", sizeof(m.title) - 1);
        strncpy(m.year, "2014", sizeof(m.year) - 1);
        strncpy(m.rating, "8.7", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 49m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Adventure", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p Remux", sizeof(m.quality) - 1);
        strncpy(m.overview, "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:92c81729dd756be303530c33a95781a73315a639&dn=Interstellar.2014.1080p.BluRay.x264&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "interstellar.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 280;
        m.peers = 50;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 2: The Dark Knight
    {
        MovieItem &m = items[1][2];
        m.id = 155;
        strncpy(m.title, "The Dark Knight", sizeof(m.title) - 1);
        strncpy(m.year, "2008", sizeof(m.year) - 1);
        strncpy(m.rating, "9.0", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 32m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Action / Crime", sizeof(m.genre) - 1);
        strncpy(m.quality, "4K UHD", sizeof(m.quality) - 1);
        strncpy(m.overview, "When the menace known as the Joker wreaks havoc on Gotham City, Batman must accept one of the greatest psychological and physical tests.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:3c19a9f4c330f81d89851eb7285a2283e5fa80c8&dn=Dark.Knight.1080p&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "darkknight.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 310;
        m.peers = 45;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 3: Dune: Part Two
    {
        MovieItem &m = items[1][3];
        m.id = 693134;
        strncpy(m.title, "Dune: Part Two", sizeof(m.title) - 1);
        strncpy(m.year, "2024", sizeof(m.year) - 1);
        strncpy(m.rating, "8.6", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 46m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Action", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p BluRay", sizeof(m.quality) - 1);
        strncpy(m.overview, "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:3c19a9f4c330f81d89851eb7285a2283e5fa80c8&dn=Dune.Part.Two.2024.1080p.WEBRip.x264&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "dune2.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 290;
        m.peers = 55;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // ==============================================================
    // CATEGORY 2: POPULAR TV SHOWS
    // ==============================================================
    strncpy(categoryNames[2], "POPULAR TV SHOWS", sizeof(categoryNames[2]) - 1);
    itemCounts[2] = 4;

    // 0: The Lord of the Rings: The Rings of Power
    {
        MovieItem &m = items[2][0];
        m.id = 84773;
        strncpy(m.title, "Rings of Power", sizeof(m.title) - 1);
        strncpy(m.year, "2024", sizeof(m.year) - 1);
        strncpy(m.rating, "7.8", sizeof(m.rating) - 1);
        strncpy(m.duration, "S02 • E08", sizeof(m.duration) - 1);
        strncpy(m.genre, "Fantasy / Adventure", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p HDR", sizeof(m.quality) - 1);
        strncpy(m.overview, "Epic drama set thousands of years before the events of J.R.R. Tolkien's The Hobbit and The Lord of the Rings.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:b56a4225ad753de08df9c89e2467d36c8413bf2a&dn=Rings.of.Power.S02E01.1080p&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "bMXWXKM9ydUmMTNvDnYo9QtCBRt.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 160;
        m.peers = 38;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 1: The Chosen
    {
        MovieItem &m = items[2][1];
        m.id = 89901;
        strncpy(m.title, "The Chosen", sizeof(m.title) - 1);
        strncpy(m.year, "2024", sizeof(m.year) - 1);
        strncpy(m.rating, "9.1", sizeof(m.rating) - 1);
        strncpy(m.duration, "S04 • E08", sizeof(m.duration) - 1);
        strncpy(m.genre, "Drama / History", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p WEB", sizeof(m.quality) - 1);
        strncpy(m.overview, "A historical drama based on the life of Jesus and those who knew him. Seen through the eyes of those who met him.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:c713b185ec2844837581b29a2862d295c52c6742&dn=The.Chosen.S04E01.1080p&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "nr0r7YTn1l84KLG1iCSO5ofHTvO.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 110;
        m.peers = 25;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 2: Swapped
    {
        MovieItem &m = items[2][2];
        m.id = 120531;
        strncpy(m.title, "Swapped", sizeof(m.title) - 1);
        strncpy(m.year, "2025", sizeof(m.year) - 1);
        strncpy(m.rating, "8.1", sizeof(m.rating) - 1);
        strncpy(m.duration, "S01 • E10", sizeof(m.duration) - 1);
        strncpy(m.genre, "Comedy / Drama", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p WEB", sizeof(m.quality) - 1);
        strncpy(m.overview, "A hilarious and heartfelt comedy about unexpected life changes and switching roles in modern family life.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:e23485ab982d92d4715fba392015a81230198fbc&dn=Swapped.S01&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "tHhxWxge06goXU6ZQH1hj7vK8Hd.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 95;
        m.peers = 20;
        LoadPosterTexture(m, renderer, nullptr);
    }

    // 3: VisionQuest
    {
        MovieItem &m = items[2][3];
        m.id = 139100;
        strncpy(m.title, "VisionQuest", sizeof(m.title) - 1);
        strncpy(m.year, "2026", sizeof(m.year) - 1);
        strncpy(m.rating, "8.4", sizeof(m.rating) - 1);
        strncpy(m.duration, "S01 • E06", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Action", sizeof(m.genre) - 1);
        strncpy(m.quality, "4K UHD", sizeof(m.quality) - 1);
        strncpy(m.overview, "White Vision attempts to regain his memories and humanity across a dangerous voyage of self-discovery.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:f123456789abcdef0123456789abcdef01234567&dn=VisionQuest.S01&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        strncpy(m.posterFilename, "WGyAyBPncfuu8MZhLY9RtfZPM0.jpg", sizeof(m.posterFilename) - 1);
        m.posterTex = nullptr;
        m.seeds = 180;
        m.peers = 45;
        LoadPosterTexture(m, renderer, nullptr);
    }
}

void CatalogManager::FetchFromNetwork(NetworkManager *net, Renderer *renderer)
{
    if (!net || !renderer) return;

    // Load poster textures for any item that doesn't have one yet
    for (int c = 0; c < MAX_CATEGORIES; c++) {
        for (int i = 0; i < itemCounts[c]; i++) {
            if (!items[c][i].posterTex && items[c][i].posterFilename[0]) {
                LoadPosterTexture(items[c][i], renderer, net);
            }
        }
    }
}

const char *CatalogManager::GetCategoryName(int catIdx) const
{
    if (catIdx >= 0 && catIdx < MAX_CATEGORIES) {
        return categoryNames[catIdx];
    }
    return "MOVIES";
}

int CatalogManager::GetItemCount(int catIdx) const
{
    if (catIdx >= 0 && catIdx < MAX_CATEGORIES) {
        return itemCounts[catIdx];
    }
    return 0;
}

const MovieItem *CatalogManager::GetItem(int catIdx, int itemIdx) const
{
    if (catIdx >= 0 && catIdx < MAX_CATEGORIES && itemIdx >= 0 && itemIdx < itemCounts[catIdx]) {
        return &items[catIdx][itemIdx];
    }
    return nullptr;
}

MovieItem *CatalogManager::GetItemMut(int catIdx, int itemIdx)
{
    if (catIdx >= 0 && catIdx < MAX_CATEGORIES && itemIdx >= 0 && itemIdx < itemCounts[catIdx]) {
        return &items[catIdx][itemIdx];
    }
    return nullptr;
}
