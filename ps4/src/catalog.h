#ifndef CATALOG_H
#define CATALOG_H

#include <stdint.h>
#include <stddef.h>
#include "renderer.h"

class NetworkManager;

struct MovieItem {
    int id;
    char title[64];
    char year[8];
    char rating[8];
    char duration[16];
    char genre[32];
    char quality[16];
    char overview[384];
    char magnet[512];
    char posterFilename[64];
    char backdropFilename[64];
    Texture *posterTex;
    int seeds;
    int peers;
};

class CatalogManager {
private:
    static const int MAX_CATEGORIES = 3;
    static const int MAX_ITEMS_PER_CAT = 10;

    char categoryNames[MAX_CATEGORIES][32];
    MovieItem items[MAX_CATEGORIES][MAX_ITEMS_PER_CAT];
    int itemCounts[MAX_CATEGORIES];

    void LoadPosterTexture(MovieItem &item, Renderer *renderer, NetworkManager *net);

public:
    CatalogManager();
    ~CatalogManager();

    void Init(Renderer *renderer);
    void FetchFromNetwork(NetworkManager *net, Renderer *renderer);

    int GetCategoryCount() const { return MAX_CATEGORIES; }
    const char *GetCategoryName(int catIdx) const;
    int GetItemCount(int catIdx) const;
    const MovieItem *GetItem(int catIdx, int itemIdx) const;
    MovieItem *GetItemMut(int catIdx, int itemIdx);
};

#endif // CATALOG_H
