# Home Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить гармоничную кнопку возврата на `/events/` на все внутренние страницы приложения, включая мобильные версии.

**Architecture:** Общий компонент `HomeLink` инкапсулирует маршрут, иконку и доступную подпись. Страницы только размещают его в существующей шапке или верхней области, а единые CSS-правила отвечают за desktop/mobile представление.

**Tech Stack:** React 19, React Router 7, TypeScript, lucide-react, CSS, Vitest.

## Global Constraints

- Ссылка всегда ведет на React Router маршрут `/`, который с basename открывает `/events/`.
- На desktop отображаются иконка и текст `На главную`; на mobile остается иконка с зоной нажатия не меньше `44 x 44 px`.
- На обычной главной странице кнопка не показывается.
- Компонент не должен быть плавающим или перекрывать контент.

---

### Task 1: Общий компонент возврата

**Files:**
- Create: `frontend/src/components/HomeLink.tsx`
- Create: `frontend/src/components/HomeLink.test.tsx`
- Modify: `frontend/src/styles/01-foundation.css`
- Modify: `frontend/src/styles/06-responsive.css`

**Interfaces:**
- Consumes: React Router `Link`, lucide-react `House`, необязательный `className?: string`.
- Produces: `HomeLink({ className?: string }): JSX.Element`, ведущий на `/`.

- [ ] **Step 1: Write the failing component test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomeLink } from "./HomeLink";

describe("HomeLink", () => {
  it("ведет на главную и сохраняет понятное доступное имя", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><HomeLink /></MemoryRouter>
    );
    expect(html).toContain('href="/"');
    expect(html).toContain('aria-label="Вернуться на главную"');
    expect(html).toContain("На главную");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/components/HomeLink.test.tsx`

Expected: FAIL because `./HomeLink` does not exist.

- [ ] **Step 3: Implement the component and shared responsive styles**

```tsx
import { House } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";

type HomeLinkProps = { className?: string };

export const HomeLink = memo(function HomeLink({ className = "" }: HomeLinkProps) {
  return (
    <Link className={`home-link ${className}`.trim()} to="/" title="Вернуться на главную" aria-label="Вернуться на главную">
      <House size={18} aria-hidden="true" />
      <span className="home-link-label">На главную</span>
    </Link>
  );
});
```

Add `.home-link` to `01-foundation.css` as an inline-flex bordered control with `min-height: 44px`, existing rose/line/panel tokens, focus-visible state, and no layout animation. In `06-responsive.css`, hide only `.home-link-label` below `720px`, preserving `44px` width and height.

- [ ] **Step 4: Run the component test**

Run: `cd frontend && npm test -- src/components/HomeLink.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HomeLink.tsx frontend/src/components/HomeLink.test.tsx frontend/src/styles/01-foundation.css frontend/src/styles/06-responsive.css
git commit -m "Add responsive home navigation control"
```

### Task 2: Подключение ко всем внутренним страницам

**Files:**
- Create: `frontend/src/navigation.test.ts`
- Modify: `frontend/src/pages/GalleryPage.tsx`
- Modify: `frontend/src/pages/RatingPage.tsx`
- Modify: `frontend/src/pages/RafflePage.tsx`
- Modify: `frontend/src/features/admin/AdminHeader.tsx`
- Modify: `frontend/src/pages/AdminLogin.tsx`
- Modify: `frontend/src/features/album/AlbumHeader.tsx`
- Modify: `frontend/src/pages/AlbumPage.tsx`
- Modify: `frontend/src/styles/01-foundation.css`
- Modify: `frontend/src/styles/04-admin.css`
- Modify: `frontend/src/styles/05-lightbox-rating.css`
- Modify: `frontend/src/styles/07-raffle-page.css`

**Interfaces:**
- Consumes: `HomeLink`, `AlbumHeader` prop `showHomeLink?: boolean`.
- Produces: возврат на главную в `/gallery`, `/rating`, `/raffle`, обоих состояниях `/admin` и `/camera`.

- [ ] **Step 1: Write the failing route coverage test**

Create a Vitest source-contract test that reads the seven integration files and asserts:

```ts
expect(gallery).toContain("<HomeLink");
expect(rating).toContain("<HomeLink");
expect(raffle).toContain("<HomeLink");
expect(adminHeader).toContain("<HomeLink");
expect(adminLogin).toContain("<HomeLink");
expect(albumHeader).toContain("showHomeLink && <HomeLink");
expect(albumPage).toContain("showHomeLink={cameraMode}");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/navigation.test.ts`

Expected: FAIL because the pages do not yet render `HomeLink`.

- [ ] **Step 3: Integrate HomeLink**

- Gallery: replace the current arrow-only `Link` with `<HomeLink />`.
- Rating: add `<nav className="page-home-nav"><HomeLink /></nav>` before the summary.
- Raffle: add the same navigation as the first child of `.giveaway-page`.
- Admin header: wrap `<HomeLink />` and logout in `.admin-header-actions`.
- Admin login: render `<HomeLink className="admin-login-home" />` before the login form.
- Album header: accept `showHomeLink?: boolean` and render it in `.album-nav-actions`; AlbumPage passes `showHomeLink={cameraMode}`.
- Add only scoped spacing/alignment rules required by these existing layouts.

- [ ] **Step 4: Run route test and full frontend check**

Run: `cd frontend && npm test -- src/navigation.test.ts && npm run check`

Expected: route test PASS, all frontend tests PASS, TypeScript PASS, Vite build PASS.

- [ ] **Step 5: Verify desktop and mobile in browser**

Open `/gallery`, `/rating`, `/raffle`, `/admin`, and `/camera` at `1440 x 900` and `390 x 844`. Confirm the control is visible, does not overlap neighboring controls, its mobile target remains at least `44 x 44 px`, and clicking it opens `/events/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/navigation.test.ts frontend/src/pages frontend/src/features frontend/src/styles
git commit -m "Add home navigation to every internal page"
```

### Task 3: Полная проверка и production

**Files:**
- Verify only.

**Interfaces:**
- Consumes: completed frontend changes.
- Produces: tested production deployment.

- [ ] **Step 1: Run repository checks**

Run: `make check`

Expected: backend tests, frontend tests, TypeScript, Vite build, Ruff and npm audit all PASS.

- [ ] **Step 2: Push main and deploy**

Push `main`, rsync the repository using the established excludes, restart `wedding-events`, and verify nginx syntax.

- [ ] **Step 3: Verify production routes**

Confirm `/events/`, `/events/gallery`, `/events/rating`, `/events/raffle`, `/events/admin`, and `/events/camera` return HTTP 200. Repeat the mobile visual check against production.
