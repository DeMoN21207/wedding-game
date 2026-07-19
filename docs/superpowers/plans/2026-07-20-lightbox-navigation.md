# Cyclic Lightbox Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cyclic arrow, keyboard, and swipe navigation to every enlarged media preview.

**Architecture:** `PhotoLightbox` becomes a controlled collection viewer backed by the existing Swiper dependency. Pages own a `LightboxSelection` snapshot containing the current collection and active index, while the component owns interaction, adjacent-image preloading, and video pausing. Existing media mapping stays close to each page because guest, personal, and admin captions use different source data.

**Tech Stack:** React 19, TypeScript, Swiper 12, Lucide React, Vitest, CSS, Vite.

## Global Constraints

- Navigation is cyclic in both directions.
- Photos and videos retain their current visible order.
- Arrow Left, Arrow Right, Escape, touch swipe, and visible side buttons must work.
- Controls are hidden for collections with fewer than two items.
- Touch targets are at least `44px` and mobile layout has no horizontal overflow.
- No new npm dependency is added.

---

### Task 1: Convert PhotoLightbox Into A Controlled Cyclic Viewer

**Files:**
- Create: `frontend/src/components/PhotoLightbox.test.tsx`
- Modify: `frontend/src/components/PhotoLightbox.tsx`

**Interfaces:**
- Produces: `LightboxPhoto` with required `id: number | string`.
- Produces: `LightboxSelection = { items: LightboxPhoto[]; activeIndex: number }`.
- Produces props: `selection: LightboxSelection | null`, `onActiveIndexChange(index: number): void`, `onClose(): void`.

- [ ] **Step 1: Write a failing source and markup test**

Create a test that renders one item and checks that navigation buttons are absent, then reads the component source and checks for `loop={hasNavigation}`, `Keyboard`, `A11y`, `keyboard={{ enabled: true }}`, `slidePrev()`, `slideNext()`, and accessible labels `Предыдущий файл` and `Следующий файл`.

```tsx
const selection: LightboxSelection = {
  activeIndex: 0,
  items: [{ id: 1, src: "/one.jpg", alt: "Фото", title: "Маша", mediaType: "image" }]
};

const html = renderToStaticMarkup(
  <PhotoLightbox selection={selection} onActiveIndexChange={() => undefined} onClose={() => undefined} />
);

expect(html).not.toContain("Предыдущий файл");
expect(html).not.toContain("Следующий файл");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd frontend && npm test -- src/components/PhotoLightbox.test.tsx`

Expected: type and assertion failures because the current component accepts a single `photo`.

- [ ] **Step 3: Implement the controlled Swiper viewer**

Import `A11y` and `Keyboard` from `swiper/modules`, `Swiper` and `SwiperSlide` from `swiper/react`, and the Swiper instance type. Derive the active item from `selection.items[selection.activeIndex]`. Configure `loop`, keyboard, touch movement, `initialSlide`, `onSwiper`, and `onSlideChange`. Side buttons call `slidePrev()` and `slideNext()`.

On slide change, pause all videos under the lightbox before calling `onActiveIndexChange(swiper.realIndex)`. Keep the existing Escape listener and body scroll lock. Use an effect with `new Image()` to preload only adjacent image items.

- [ ] **Step 4: Run the focused component test**

Run: `cd frontend && npm test -- src/components/PhotoLightbox.test.tsx`

Expected: the component test passes. Full typecheck follows after Task 2 migrates all call sites.

- [ ] **Step 5: Commit the component**

```bash
git add frontend/src/components/PhotoLightbox.tsx frontend/src/components/PhotoLightbox.test.tsx
git commit -m "Add cyclic navigation to photo lightbox"
```

### Task 2: Supply Ordered Collections From Every Page

**Files:**
- Create: `frontend/src/lightbox-navigation.test.ts`
- Modify: `frontend/src/pages/GalleryPage.tsx`
- Modify: `frontend/src/pages/AlbumPage.tsx`
- Modify: `frontend/src/pages/AdminPage.tsx`

**Interfaces:**
- Consumes: `LightboxSelection` and controlled `PhotoLightbox` props from Task 1.
- Produces: memoized page-specific `LightboxPhoto[]` collections and selection snapshots.

- [ ] **Step 1: Write a failing call-site contract test**

Read the three page source files and assert each contains `selection={lightboxSelection}`, `onActiveIndexChange={selectLightboxIndex}`, and no longer contains `photo={lightboxPhoto}`. Assert Gallery creates `galleryLightboxItems`, Album creates `recentLightboxItems` and `myLightboxItems`, and Admin creates `recentLightboxItems` and `adminLightboxItems`.

- [ ] **Step 2: Run the call-site test and verify RED**

Run: `cd frontend && npm test -- src/lightbox-navigation.test.ts`

Expected: failure because all pages still hold one `LightboxPhoto`.

- [ ] **Step 3: Migrate GalleryPage**

Use `useMemo` to map all loaded entries with a preview URL to `LightboxPhoto[]`. Replace single-photo state with `LightboxSelection | null`. Opening a card finds its id in the memoized collection and stores `{ items, activeIndex }`; index changes update only `activeIndex`.

- [ ] **Step 4: Migrate AlbumPage**

Build separate memoized collections for recent album media and personal media so navigation remains inside the section the guest opened. Both opening callbacks create a selection from the matching collection.

- [ ] **Step 5: Migrate AdminPage**

Build separate memoized collections for overview recent media and the current admin photo grid. Preserve admin original URLs, size metadata, and download behavior.

- [ ] **Step 6: Run call-site tests and typecheck**

Run: `cd frontend && npm test -- src/lightbox-navigation.test.ts src/components/PhotoLightbox.test.tsx && npm run typecheck`

Expected: tests and TypeScript pass.

- [ ] **Step 7: Commit page integration**

```bash
git add frontend/src/lightbox-navigation.test.ts frontend/src/pages/GalleryPage.tsx frontend/src/pages/AlbumPage.tsx frontend/src/pages/AdminPage.tsx
git commit -m "Connect media collections to lightbox navigation"
```

### Task 3: Add Responsive Side Controls

**Files:**
- Modify: `frontend/src/components/PhotoLightbox.test.tsx`
- Modify: `frontend/src/styles/05-lightbox-rating.css`
- Modify: `frontend/src/styles/06-responsive.css`

**Interfaces:**
- Consumes: `.lightbox-previous`, `.lightbox-next`, `.photo-lightbox-swiper`, and `.photo-lightbox-slide` classes from Task 1.
- Produces: side controls at least `44px` on desktop and mobile without media resizing or horizontal overflow.

- [ ] **Step 1: Add failing CSS source assertions**

Assert both navigation classes are positioned absolutely, the shared button rule has `width` and `height` of at least `44px`, and the responsive stylesheet keeps both at least `44px` below `760px`.

- [ ] **Step 2: Run the component test and verify RED**

Run: `cd frontend && npm test -- src/components/PhotoLightbox.test.tsx`

Expected: CSS assertions fail because navigation styles do not exist.

- [ ] **Step 3: Implement desktop and mobile styles**

Make the Swiper fill the lightbox width, center each slide, and preserve the existing media `contain` sizing. Position the previous and next buttons at the vertical center with restrained translucent backgrounds. Use `52px` desktop targets and `46px` mobile targets, safe-area-aware side offsets, and a higher z-index than media.

- [ ] **Step 4: Run focused frontend verification**

Run: `cd frontend && npm test -- src/components/PhotoLightbox.test.tsx src/lightbox-navigation.test.ts && npm run typecheck`

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit responsive styling**

```bash
git add frontend/src/components/PhotoLightbox.test.tsx frontend/src/styles/05-lightbox-rating.css frontend/src/styles/06-responsive.css
git commit -m "Style responsive lightbox navigation"
```

### Task 4: Verify And Deploy

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run full checks**

Run: `make check`

Expected: Ruff, backend tests, frontend tests, TypeScript, Vite build, and npm audit pass.

- [ ] **Step 2: Verify in browser**

At desktop `1440x900`, open a gallery item and verify both side buttons, cyclic wrapping, Arrow Left/Right, Escape, captions, download links, and mixed photo/video navigation. At mobile `390x844`, verify swipe in both directions, controls at least `44px`, media containment, and no horizontal overflow.

- [ ] **Step 3: Push and deploy**

Push `main`, rsync the project to `/var/www/our-day-dv.ru/events-app`, restart `wedding-events`, and validate nginx configuration.

- [ ] **Step 4: Verify production**

Confirm `/events/`, `/events/gallery`, and `/events/admin` return `200`; browser-check production lightbox navigation; confirm `wedding-events`, `nginx`, and PostgreSQL are active with no fresh warnings.
