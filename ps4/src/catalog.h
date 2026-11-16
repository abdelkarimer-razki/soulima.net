#ifndef CATALOG_H
#define CATALOG_H

#include <stdint.h>
#include <stddef.h>

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
    int seeds;
    int peers;
};

class CatalogManager {
private:
    static const int MAX_CATEGORIES = 3;
    static const int MAX_ITEMS_PER_CAT = 8;

    char categoryNames[MAX_CATEGORIES][32];
    MovieItem items[MAX_CATEGORIES][MAX_ITEMS_PER_CAT];
    int itemCounts[MAX_CATEGORIES];

public:
    CatalogManager();

    void Init();
    int GetCategoryCount() const { return MAX_CATEGORIES; }
    const char *GetCategoryName(int catIdx) const;
    int GetItemCount(int catIdx) const;
    const MovieItem *GetItem(int catIdx, int itemIdx) const;
};

#endif // CATALOG_H
