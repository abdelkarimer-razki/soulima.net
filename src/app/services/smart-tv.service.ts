import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class SmartTvService {
  isSmartTv = false;
  tvModeActive = false;

  private registeredTizen = false;

  constructor(private router: Router, private ngZone: NgZone) {
    this.detectTv();
    this.initTizenKeys();
    this.initGlobalListeners();
  }

  /**
   * Detects whether the current device is a Smart TV (Samsung Tizen, LG webOS,
   * Android TV, Fire TV, Apple TV, etc.) via User Agent inspection.
   */
  detectTv(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const tvPatterns = [
      /SmartTV/i,
      /Tizen/i,
      /webOS/i,
      /Web0S/i,
      /NetCast/i,
      /HbbTV/i,
      /AppleTV/i,
      /BRAVIA/i,
      /GoogleTV/i,
      /Android.*TV/i,
      /AFT[A-Z]/i, // Amazon Fire TV
      /POV_TV/i,
      /InettvApp/i,
      /Opera TV/i,
      /Viera/i
    ];

    this.isSmartTv = tvPatterns.some(p => p.test(ua));
    if (this.isSmartTv) {
      this.enableTvMode();
    }
    return this.isSmartTv;
  }

  enableTvMode(): void {
    this.tvModeActive = true;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('soulima-tv');
    }
  }

  /**
   * Samsung Tizen TV remote key registration so that the TV OS passes
   * media keys, numbers, and color keys directly into the web application.
   */
  private initTizenKeys(): void {
    if (typeof window === 'undefined' || this.registeredTizen) return;
    const w = window as any;
    if (w.tizen && w.tizen.tvinputdevice && typeof w.tizen.tvinputdevice.registerKey === 'function') {
      const keysToRegister = [
        'MediaPlay',
        'MediaPause',
        'MediaPlayPause',
        'MediaFastForward',
        'MediaRewind',
        'MediaStop',
        'ColorF0Red',
        'ColorF1Green',
        'ColorF2Yellow',
        'ColorF3Blue',
        '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
      ];
      keysToRegister.forEach(k => {
        try {
          w.tizen.tvinputdevice.registerKey(k);
        } catch (_) {}
      });
      this.registeredTizen = true;
    }
  }

  /**
   * Global TV Remote D-Pad Navigation & Back key listener.
   */
  private initGlobalListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleKey(e);
    }, { capture: true });
  }

  private handleKey(e: KeyboardEvent): void {
    const code = e.keyCode;
    const key = e.key;

    // Detect first D-pad interaction even if UA was not explicitly recognized as TV
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      if (!this.tvModeActive) {
        this.enableTvMode();
      }
    }

    // Samsung Tizen Return (10009), LG webOS Back (461), Escape (27), Android TV Back (4)
    if (code === 10009 || code === 461 || key === 'Escape' || key === 'GoBack' || key === 'BrowserBack') {
      this.handleTvBack(e);
      return;
    }

    // Do not intercept D-pad if currently in a text input or textarea
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      if (key === 'Escape') {
        target.blur();
        e.preventDefault();
      }
      return;
    }

    // Spatial navigation for arrow keys outside of the video player
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      const isPlayerActive = !!document.querySelector('.torrentPlayer');
      if (!isPlayerActive) {
        this.navigateSpatial(key, e);
      }
    }
  }

  /**
   * Smart TV Back button behavior
   */
  handleTvBack(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();

    // 1. If details popup is open, close it
    const popup = document.querySelector('.bluredBackground') as HTMLElement | null;
    if (popup) {
      const closeBtn = popup.querySelector('.closeSvg') as HTMLElement | null;
      if (closeBtn) {
        closeBtn.click();
        return;
      }
      popup.click();
      return;
    }

    // 2. If mobile search drawer is open, close it
    const searchDrawer = document.querySelector('.mobileSearchDrawer') as HTMLElement | null;
    if (searchDrawer) {
      const closeBtn = document.querySelector('.mobileSearchClose') as HTMLElement | null;
      if (closeBtn) closeBtn.click();
      return;
    }

    // 3. If in player, navigate back
    const backBtn = document.querySelector('.hudBackBtn, .overlayBackLink') as HTMLElement | null;
    if (backBtn) {
      backBtn.click();
      return;
    }

    // 4. Default: Router back or go to home
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/']);
    }
  }

  /**
   * Tier-Aware Spatial Navigation Engine
   * Seamlessly navigates horizontal carousels, grids, filter bars, and between scrollable tiers.
   */
  private navigateSpatial(direction: string, e: KeyboardEvent): void {
    const modal = document.querySelector('.bluredBackground') as HTMLElement | null;
    if (modal) {
      this.navigateModalSpatial(direction, e, modal);
      return;
    }

    const focusable = this.getFocusableElements();
    if (!focusable.length) return;

    let current = document.activeElement as HTMLElement | null;

    // Normalize focus if activeElement is document.body, invalid, or an img
    if (!current || current === document.body || !focusable.includes(current) || current.tagName === 'IMG') {
      const best = this.findInitialFocus(focusable);
      if (best) {
        e.preventDefault();
        best.focus();
        this.scrollElementIntoView(best);
      }
      return;
    }

    const currentTier = this.getElementTier(current);

    if (direction === 'ArrowLeft' || direction === 'ArrowRight') {
      this.navigateHorizontal(direction, current, currentTier, focusable, e);
      return;
    }

    if (direction === 'ArrowDown' || direction === 'ArrowUp') {
      this.navigateVerticalTiers(direction, current, currentTier, focusable, e);
      return;
    }
  }

  /**
   * Navigates left/right within the current tier.
   */
  private navigateHorizontal(
    direction: string,
    current: HTMLElement,
    currentTier: HTMLElement | null,
    allFocusable: HTMLElement[],
    e: KeyboardEvent
  ): void {
    if (!currentTier) {
      this.fallbackSpatial(direction, current, allFocusable, e);
      return;
    }

    if (currentTier.classList.contains('modernSearchGrid')) {
      this.navigateGridHorizontal(direction, current, currentTier, e);
      return;
    }

    const tierItems = this.getTierFocusableItems(currentTier);
    const currentIndex = tierItems.indexOf(current);

    if (currentIndex === -1) {
      this.fallbackSpatial(direction, current, allFocusable, e);
      return;
    }

    let nextIndex = currentIndex;
    if (direction === 'ArrowRight' && currentIndex < tierItems.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (direction === 'ArrowLeft' && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    }

    if (nextIndex !== currentIndex) {
      e.preventDefault();
      const nextItem = tierItems[nextIndex];
      nextItem.focus();
      nextItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /**
   * Navigates up/down across tiers (rows), automatically scrolling the window vertically.
   */
  private navigateVerticalTiers(
    direction: string,
    current: HTMLElement,
    currentTier: HTMLElement | null,
    allFocusable: HTMLElement[],
    e: KeyboardEvent
  ): void {
    // If inside a grid (.modernSearchGrid), navigate grid rows first
    if (currentTier && currentTier.classList.contains('modernSearchGrid')) {
      const handled = this.navigateGridVertical(direction, current, currentTier, e);
      if (handled) return;
    }

    const tiers = this.getAllTiers();
    if (!tiers.length || !currentTier) {
      this.fallbackSpatial(direction, current, allFocusable, e);
      return;
    }

    const currentTierIndex = tiers.indexOf(currentTier);
    if (currentTierIndex === -1) {
      this.fallbackSpatial(direction, current, allFocusable, e);
      return;
    }

    let targetTierIndex = -1;
    if (direction === 'ArrowDown') {
      if (currentTierIndex < tiers.length - 1) {
        targetTierIndex = currentTierIndex + 1;
      }
    } else if (direction === 'ArrowUp') {
      if (currentTierIndex > 0) {
        targetTierIndex = currentTierIndex - 1;
      }
    }

    if (targetTierIndex === -1) {
      return;
    }

    // Skip any empty tiers (e.g. empty continue watching)
    let finalTargetTier = tiers[targetTierIndex];
    let finalItems = this.getTierFocusableItems(finalTargetTier);

    while (!finalItems.length && targetTierIndex >= 0 && targetTierIndex < tiers.length) {
      targetTierIndex += (direction === 'ArrowDown' ? 1 : -1);
      if (targetTierIndex >= 0 && targetTierIndex < tiers.length) {
        finalTargetTier = tiers[targetTierIndex];
        finalItems = this.getTierFocusableItems(finalTargetTier);
      }
    }

    if (!finalItems.length) return;

    // Pick the item in the target tier closest to the current element's horizontal center
    const currentRect = current.getBoundingClientRect();
    const currentCenter = (currentRect.left + currentRect.right) / 2;

    let bestItem = finalItems[0];
    let minDiff = Infinity;

    for (const item of finalItems) {
      const r = item.getBoundingClientRect();
      const center = (r.left + r.right) / 2;
      const diff = Math.abs(center - currentCenter);
      if (diff < minDiff) {
        minDiff = diff;
        bestItem = item;
      }
    }

    e.preventDefault();
    bestItem.focus();

    // 1. Center the item in its horizontal scroll container
    bestItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // 2. Smoothly scroll the window vertically to center the new tier on the TV screen
    this.centerTierVertically(finalTargetTier, targetTierIndex);
  }

  /**
   * Centers the given tier in the middle of the TV viewport.
   */
  private centerTierVertically(tier: HTMLElement, tierIndex: number): void {
    if (typeof window === 'undefined') return;

    // If near the top (Navbar, Hero Billboard, Filter Pills)
    if (tierIndex <= 1 || tier.classList.contains('posterContainer') || tier.classList.contains('heroButtons') || tier.classList.contains('navBar')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const tierRect = tier.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const targetY = window.scrollY + tierRect.top - (windowHeight / 2) + (tierRect.height / 2);

    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: 'smooth'
    });
  }

  /**
   * Identifies which tier container an element belongs to.
   */
  private getElementTier(el: HTMLElement): HTMLElement | null {
    // 1. Category shelf
    const categorie = el.closest('.categorie') as HTMLElement | null;
    if (categorie) return categorie;

    // 2. Filter pills bar
    const filterPills = el.closest('.filterPillsContainer') as HTMLElement | null;
    if (filterPills) return filterPills;

    // 3. Hero buttons
    const heroButtons = el.closest('.heroButtons') as HTMLElement | null;
    if (heroButtons) return heroButtons;

    // 4. Search filter tabs
    const searchFilter = el.closest('.searchFilterTabs') as HTMLElement | null;
    if (searchFilter) return searchFilter;

    // 5. Modern search grid
    const searchGrid = el.closest('.modernSearchGrid') as HTMLElement | null;
    if (searchGrid) return searchGrid;

    // 6. Top navigation bar
    const navBar = el.closest('.navBar') as HTMLElement | null;
    if (navBar) return navBar;

    // 7. Footer
    const footer = el.closest('.app-footer') as HTMLElement | null;
    if (footer) return footer;

    return null;
  }

  /**
   * Returns all horizontal tiers in DOM order.
   */
  private getAllTiers(): HTMLElement[] {
    const tiers: HTMLElement[] = [];

    // Tier 0: Top Navigation Bar
    const navBar = document.querySelector('.navBar') as HTMLElement | null;
    if (navBar && this.isVisible(navBar)) {
      tiers.push(navBar);
    }

    // Tier 1: Hero Billboard Buttons
    const heroButtons = document.querySelector('.heroButtons') as HTMLElement | null;
    if (heroButtons && this.isVisible(heroButtons)) {
      tiers.push(heroButtons);
    }

    // Tier 2: Filter Pills Bar
    const filterPills = document.querySelector('.filterPillsContainer') as HTMLElement | null;
    if (filterPills && this.isVisible(filterPills)) {
      tiers.push(filterPills);
    }

    // Search Tabs (if search mode)
    const searchTabs = document.querySelector('.searchFilterTabs') as HTMLElement | null;
    if (searchTabs && this.isVisible(searchTabs)) {
      tiers.push(searchTabs);
    }

    // Search Grid (if search mode)
    const searchGrid = document.querySelector('.modernSearchGrid') as HTMLElement | null;
    if (searchGrid && this.isVisible(searchGrid)) {
      tiers.push(searchGrid);
    }

    // Tier 3+: Horizontal Content Shelves (.categorie)
    const categories = Array.from(document.querySelectorAll<HTMLElement>('.categorie'));
    for (const cat of categories) {
      if (this.isVisible(cat)) {
        const items = this.getTierFocusableItems(cat);
        if (items.length > 0) {
          tiers.push(cat);
        }
      }
    }

    // Footer Tier
    const footer = document.querySelector('.app-footer') as HTMLElement | null;
    if (footer && this.isVisible(footer)) {
      tiers.push(footer);
    }

    return tiers;
  }

  /**
   * Returns all visible, focusable interactive items within a tier.
   * Explicitly filters out <img> and non-interactive tags.
   */
  private getTierFocusableItems(tier: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      '[tabindex="0"]'
    ].join(', ');

    const items = Array.from(tier.querySelectorAll<HTMLElement>(selector));
    return items.filter(el => {
      if (el.tagName === 'IMG') return false;
      return this.isVisible(el);
    });
  }

  /**
   * Grid vertical navigation for search results.
   */
  private navigateGridVertical(
    direction: string,
    current: HTMLElement,
    grid: HTMLElement,
    e: KeyboardEvent
  ): boolean {
    const items = this.getTierFocusableItems(grid);
    if (!items.length) return false;

    const currentRect = current.getBoundingClientRect();
    let bestCandidate: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const candidate of items) {
      if (candidate === current) continue;
      const rect = candidate.getBoundingClientRect();

      let isDirectionallyValid = false;
      let primaryDiff = 0;
      const secondaryDiff = Math.abs(rect.left - currentRect.left);

      if (direction === 'ArrowDown') {
        isDirectionallyValid = rect.top >= currentRect.bottom - 5;
        primaryDiff = rect.top - currentRect.bottom;
      } else if (direction === 'ArrowUp') {
        isDirectionallyValid = rect.bottom <= currentRect.top + 5;
        primaryDiff = currentRect.top - rect.bottom;
      }

      if (isDirectionallyValid) {
        const distance = primaryDiff + (secondaryDiff * 1.5);
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) {
      e.preventDefault();
      bestCandidate.focus();
      bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return true;
    }

    return false;
  }

  /**
   * Grid horizontal navigation for search results.
   */
  private navigateGridHorizontal(
    direction: string,
    current: HTMLElement,
    grid: HTMLElement,
    e: KeyboardEvent
  ): void {
    const items = this.getTierFocusableItems(grid);
    const currentIndex = items.indexOf(current);
    if (currentIndex === -1) return;

    if (direction === 'ArrowRight' && currentIndex < items.length - 1) {
      e.preventDefault();
      const next = items[currentIndex + 1];
      next.focus();
      next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } else if (direction === 'ArrowLeft' && currentIndex > 0) {
      e.preventDefault();
      const prev = items[currentIndex - 1];
      prev.focus();
      prev.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  /**
   * Modal spatial navigation confined within modal dialogs.
   */
  private navigateModalSpatial(direction: string, e: KeyboardEvent, modal: HTMLElement): void {
    const items = this.getTierFocusableItems(modal);
    if (!items.length) return;

    const current = document.activeElement as HTMLElement | null;
    if (!current || !items.includes(current)) {
      const first = items[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    this.fallbackSpatial(direction, current, items, e);
  }

  /**
   * Geometric fallback nearest-neighbor spatial navigation for non-tier contexts.
   */
  private fallbackSpatial(
    direction: string,
    current: HTMLElement,
    candidates: HTMLElement[],
    e: KeyboardEvent
  ): void {
    const currentRect = current.getBoundingClientRect();
    let bestCandidate: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
      if (candidate === current || candidate.tagName === 'IMG' || !this.isVisible(candidate)) continue;
      const rect = candidate.getBoundingClientRect();

      let isDirectionallyValid = false;
      let primaryDiff = 0;
      let secondaryDiff = 0;

      switch (direction) {
        case 'ArrowRight':
          isDirectionallyValid = rect.left >= currentRect.left + 5;
          primaryDiff = rect.left - currentRect.left;
          secondaryDiff = Math.abs(rect.top - currentRect.top);
          break;
        case 'ArrowLeft':
          isDirectionallyValid = rect.right <= currentRect.right - 5;
          primaryDiff = currentRect.right - rect.right;
          secondaryDiff = Math.abs(rect.top - currentRect.top);
          break;
        case 'ArrowDown':
          isDirectionallyValid = rect.top >= currentRect.top + 10;
          primaryDiff = rect.top - currentRect.top;
          secondaryDiff = Math.abs(rect.left - currentRect.left);
          break;
        case 'ArrowUp':
          isDirectionallyValid = rect.bottom <= currentRect.bottom - 10;
          primaryDiff = currentRect.bottom - rect.bottom;
          secondaryDiff = Math.abs(rect.left - currentRect.left);
          break;
      }

      if (isDirectionallyValid) {
        const distance = primaryDiff + (secondaryDiff * 1.8);
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) {
      e.preventDefault();
      bestCandidate.focus();
      bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }

  /**
   * Finds the best default focus candidate when no item is currently active.
   */
  private findInitialFocus(focusable: HTMLElement[]): HTMLElement | null {
    const activePill = document.querySelector('.filterPill.active') as HTMLElement | null;
    if (activePill && this.isVisible(activePill)) return activePill;

    const playBtn = document.querySelector('.heroButtons .play') as HTMLElement | null;
    if (playBtn && this.isVisible(playBtn)) return playBtn;

    const firstCard = focusable.find(el => el.classList.contains('movieCardLink') || el.classList.contains('recentCard'));
    if (firstCard && this.isVisible(firstCard)) return firstCard;

    return focusable.find(el => this.isVisible(el)) || null;
  }

  private scrollElementIntoView(el: HTMLElement): void {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  private getFocusableElements(): HTMLElement[] {
    const modal = document.querySelector('.bluredBackground') as HTMLElement | null;
    const root: ParentNode = modal || document;
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      '[tabindex="0"]'
    ].join(', ');

    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
    return elements.filter(el => {
      if (el.tagName === 'IMG') return false;
      return this.isVisible(el);
    });
  }

  private isVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(el).visibility !== 'hidden' &&
      window.getComputedStyle(el).display !== 'none'
    );
  }
}
