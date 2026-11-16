#include "catalog.h"
#include <string.h>
#include <stdio.h>

CatalogManager::CatalogManager()
{
    memset(itemCounts, 0, sizeof(itemCounts));
    memset(items, 0, sizeof(items));
    Init();
}

void CatalogManager::Init()
{
    // Category 0: Trending Cinema
    strncpy(categoryNames[0], "TRENDING CINEMA", sizeof(categoryNames[0]) - 1);
    
    // 0: Dune: Part Two
    {
        MovieItem &m = items[0][0];
        m.id = 693134;
        strncpy(m.title, "Dune: Part Two", sizeof(m.title) - 1);
        strncpy(m.year, "2024", sizeof(m.year) - 1);
        strncpy(m.rating, "8.6", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 46m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Action", sizeof(m.genre) - 1);
        strncpy(m.quality, "4K UHD", sizeof(m.quality) - 1);
        strncpy(m.overview, "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. Facing a choice between love and fate, he endeavors to prevent a terrible future.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:3c19a9f4c330f81d89851eb7285a2283e5fa80c8&dn=Dune.Part.Two.2024.1080p.WEBRip.x264&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 240;
        m.peers = 45;
    }

    // 1: Oppenheimer
    {
        MovieItem &m = items[0][1];
        m.id = 872585;
        strncpy(m.title, "Oppenheimer", sizeof(m.title) - 1);
        strncpy(m.year, "2023", sizeof(m.year) - 1);
        strncpy(m.rating, "8.4", sizeof(m.rating) - 1);
        strncpy(m.duration, "3h 00m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Biography / Drama", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p Bluray", sizeof(m.quality) - 1);
        strncpy(m.overview, "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during the Manhattan Project.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:ec34c231dde3e92d8d26a17c223152c8541295aa&dn=Oppenheimer.2023.1080p.BluRay.x264&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 184;
        m.peers = 32;
    }

    // 2: Interstellar
    {
        MovieItem &m = items[0][2];
        m.id = 157336;
        strncpy(m.title, "Interstellar", sizeof(m.title) - 1);
        strncpy(m.year, "2014", sizeof(m.year) - 1);
        strncpy(m.rating, "8.7", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 49m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Adventure", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p Remux", sizeof(m.quality) - 1);
        strncpy(m.overview, "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot is tasked to pilot a spacecraft along with a team of researchers to find a new planet for humans.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:92c81729dd756be303530c33a95781a73315a639&dn=Interstellar.2014.1080p.BluRay.x264&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 195;
        m.peers = 28;
    }

    // 3: The Dark Knight
    {
        MovieItem &m = items[0][3];
        m.id = 155;
        strncpy(m.title, "The Dark Knight", sizeof(m.title) - 1);
        strncpy(m.year, "2008", sizeof(m.year) - 1);
        strncpy(m.rating, "9.0", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 32m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Action / Crime", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p HD", sizeof(m.quality) - 1);
        strncpy(m.overview, "When the menace known as the Joker wreaks havoc and chaos on Gotham City, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:8f2a1b9c3d4e5f60718293a4b5c6d7e8f9012345&dn=The.Dark.Knight.2008.1080p.BluRay&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 210;
        m.peers = 35;
    }

    // 4: Inception
    {
        MovieItem &m = items[0][4];
        m.id = 27205;
        strncpy(m.title, "Inception", sizeof(m.title) - 1);
        strncpy(m.year, "2010", sizeof(m.year) - 1);
        strncpy(m.rating, "8.8", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 28m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Action / Sci-Fi", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p HD", sizeof(m.quality) - 1);
        strncpy(m.overview, "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:a1b2c3d4e5f60718293a4b5c6d7e8f9012345678&dn=Inception.2010.1080p.BluRay&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 160;
        m.peers = 20;
    }

    // 5: Spider-Man: Spider-Verse
    {
        MovieItem &m = items[0][5];
        m.id = 569094;
        strncpy(m.title, "Across the Spider-Verse", sizeof(m.title) - 1);
        strncpy(m.year, "2023", sizeof(m.year) - 1);
        strncpy(m.rating, "8.7", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 20m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Animation / Action", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p WEB", sizeof(m.quality) - 1);
        strncpy(m.overview, "Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:b2c3d4e5f60718293a4b5c6d7e8f90123456789a&dn=Spider.Man.Across.the.Spider.Verse.2023&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 175;
        m.peers = 30;
    }
    itemCounts[0] = 6;

    // Category 1: Cinematic Masterpieces
    strncpy(categoryNames[1], "MASTERPIECES", sizeof(categoryNames[1]) - 1);

    // 0: Pulp Fiction
    {
        MovieItem &m = items[1][0];
        m.id = 680;
        strncpy(m.title, "Pulp Fiction", sizeof(m.title) - 1);
        strncpy(m.year, "1994", sizeof(m.year) - 1);
        strncpy(m.rating, "8.9", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 34m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Crime / Drama", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p Remux", sizeof(m.quality) - 1);
        strncpy(m.overview, "The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:c3d4e5f60718293a4b5c6d7e8f90123456789ab1&dn=Pulp.Fiction.1994.1080p.BluRay&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 145;
        m.peers = 18;
    }

    // 1: Fight Club
    {
        MovieItem &m = items[1][1];
        m.id = 550;
        strncpy(m.title, "Fight Club", sizeof(m.title) - 1);
        strncpy(m.year, "1999", sizeof(m.year) - 1);
        strncpy(m.rating, "8.8", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 19m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Drama / Thriller", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p HD", sizeof(m.quality) - 1);
        strncpy(m.overview, "An insomniac office worker and a devil-may-care soap maker form an underground fight club that evolves into much more.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:d4e5f60718293a4b5c6d7e8f90123456789ab1c2&dn=Fight.Club.1999.1080p.BluRay&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 130;
        m.peers = 15;
    }

    // 2: GoodFellas
    {
        MovieItem &m = items[1][2];
        m.id = 769;
        strncpy(m.title, "GoodFellas", sizeof(m.title) - 1);
        strncpy(m.year, "1990", sizeof(m.year) - 1);
        strncpy(m.rating, "8.7", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 25m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Biography / Crime", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p HD", sizeof(m.quality) - 1);
        strncpy(m.overview, "The story of Henry Hill and his life in the mafia, covering his relationship with his wife Karen and his mob partners Jimmy Conway and Tommy DeVito.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:e5f60718293a4b5c6d7e8f90123456789ab1c2d3&dn=GoodFellas.1990.1080p.BluRay&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 115;
        m.peers = 14;
    }

    // 3: The Matrix
    {
        MovieItem &m = items[1][3];
        m.id = 603;
        strncpy(m.title, "The Matrix", sizeof(m.title) - 1);
        strncpy(m.year, "1999", sizeof(m.year) - 1);
        strncpy(m.rating, "8.7", sizeof(m.rating) - 1);
        strncpy(m.duration, "2h 16m", sizeof(m.duration) - 1);
        strncpy(m.genre, "Sci-Fi / Action", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p Remux", sizeof(m.quality) - 1);
        strncpy(m.overview, "When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:f60718293a4b5c6d7e8f90123456789ab1c2d3e4&dn=The.Matrix.1999.1080p.BluRay&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 170;
        m.peers = 24;
    }
    itemCounts[1] = 4;

    // Category 2: Popular Series
    strncpy(categoryNames[2], "POPULAR SERIES", sizeof(categoryNames[2]) - 1);

    // 0: Breaking Bad
    {
        MovieItem &m = items[2][0];
        m.id = 1396;
        strncpy(m.title, "Breaking Bad", sizeof(m.title) - 1);
        strncpy(m.year, "2008", sizeof(m.year) - 1);
        strncpy(m.rating, "9.5", sizeof(m.rating) - 1);
        strncpy(m.duration, "5 Seasons", sizeof(m.duration) - 1);
        strncpy(m.genre, "Crime / Drama", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p HD", sizeof(m.quality) - 1);
        strncpy(m.overview, "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student in order to secure his family's future.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:0718293a4b5c6d7e8f90123456789ab1c2d3e4f5&dn=Breaking.Bad.Complete.Series.1080p&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 280;
        m.peers = 42;
    }

    // 1: Chernobyl
    {
        MovieItem &m = items[2][1];
        m.id = 87108;
        strncpy(m.title, "Chernobyl", sizeof(m.title) - 1);
        strncpy(m.year, "2019", sizeof(m.year) - 1);
        strncpy(m.rating, "9.4", sizeof(m.rating) - 1);
        strncpy(m.duration, "Miniseries", sizeof(m.duration) - 1);
        strncpy(m.genre, "Drama / History", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p WEB", sizeof(m.quality) - 1);
        strncpy(m.overview, "In April 1986, an explosion at the Chernobyl nuclear power plant in the Union of Soviet Socialist Republics becomes one of the world's worst man-made catastrophes.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:18293a4b5c6d7e8f90123456789ab1c2d3e4f506&dn=Chernobyl.Complete.Miniseries.1080p&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 165;
        m.peers = 22;
    }

    // 2: Stranger Things
    {
        MovieItem &m = items[2][2];
        m.id = 66732;
        strncpy(m.title, "Stranger Things", sizeof(m.title) - 1);
        strncpy(m.year, "2016", sizeof(m.year) - 1);
        strncpy(m.rating, "8.7", sizeof(m.rating) - 1);
        strncpy(m.duration, "4 Seasons", sizeof(m.duration) - 1);
        strncpy(m.genre, "Drama / Fantasy", sizeof(m.genre) - 1);
        strncpy(m.quality, "1080p 4K", sizeof(m.quality) - 1);
        strncpy(m.overview, "When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.", sizeof(m.overview) - 1);
        strncpy(m.magnet, "magnet:?xt=urn:btih:293a4b5c6d7e8f90123456789ab1c2d3e4f50617&dn=Stranger.Things.S04.1080p&tr=udp://tracker.opentrackr.org:1337/announce", sizeof(m.magnet) - 1);
        m.seeds = 220;
        m.peers = 36;
    }
    itemCounts[2] = 3;
}

const char *CatalogManager::GetCategoryName(int catIdx) const
{
    if (catIdx < 0 || catIdx >= MAX_CATEGORIES) return "";
    return categoryNames[catIdx];
}

int CatalogManager::GetItemCount(int catIdx) const
{
    if (catIdx < 0 || catIdx >= MAX_CATEGORIES) return 0;
    return itemCounts[catIdx];
}

const MovieItem *CatalogManager::GetItem(int catIdx, int itemIdx) const
{
    if (catIdx < 0 || catIdx >= MAX_CATEGORIES) return nullptr;
    if (itemIdx < 0 || itemIdx >= itemCounts[catIdx]) return nullptr;
    return &items[catIdx][itemIdx];
}
