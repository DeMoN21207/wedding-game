# Unique Guest Nicknames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject duplicate guest nicknames with a clear inline message and improve participant readability on the raffle page.

**Architecture:** PostgreSQL remains the source of truth through the existing per-event normalized nickname uniqueness constraint. FastAPI converts both the normal duplicate path and the concurrent `IntegrityError` path into the same `409 NICKNAME_TAKEN` response; React displays that error inside the welcome dialog and clears it when the guest edits the nickname. Raffle sizing remains CSS-only and keeps the existing dense mode for lists over 20 participants.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/SQLite tests, React 19, TypeScript, Vitest, CSS, Vite.

## Global Constraints

- Nicknames are unique only within the active event.
- Normalization ignores surrounding whitespace, repeated spaces, and letter case.
- Duplicate registration must never reveal another guest's token.
- Duplicate copy is exactly `Этот ник уже занят. Придумайте другой.`
- Lists above 20 participants retain compact density.
- Long nicknames remain ellipsized without resizing the grid.

---

### Task 1: Reject Duplicate Nicknames In The API

**Files:**
- Modify: `backend/tests/test_guests.py`
- Modify: `backend/tests/test_album.py`
- Modify: `backend/app/routers/guests.py`

**Interfaces:**
- Consumes: `normalize_nickname(value: str) -> str`, database constraint `uq_guests_event_nickname`.
- Produces: `POST /api/guests` returns `409` with `{ "detail": { "code": "NICKNAME_TAKEN", "message": "Этот ник уже занят. Придумайте другой." } }` for a normalized duplicate.

- [ ] **Step 1: Replace reuse expectations with failing duplicate-rejection tests**

```python
def test_duplicate_nickname_is_rejected_within_same_event(client):
    event = create_event(client, "Свадьба")
    first = create_guest(client, event["token"], "Саша")

    response = client.post(
        "/api/guests",
        json={"event_token": event["token"], "nickname": " саша "},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "code": "NICKNAME_TAKEN",
            "message": "Этот ник уже занят. Придумайте другой.",
        }
    }
    assert first["guest_token"] not in response.text
```

Update the album-mode test in `backend/tests/test_album.py` to expect the same `409` response when no event token is supplied.

Add a concurrent registration test in `backend/tests/test_guests.py`:

```python
def test_concurrent_duplicate_registration_creates_one_guest(client):
    event = create_event(client, "Свадьба")

    def register():
        return client.post(
            "/api/guests",
            json={"event_token": event["token"], "nickname": "Одинаковый"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: register(), range(2)))

    assert sorted(response.status_code for response in responses) == [201, 409]
    duplicate = next(response for response in responses if response.status_code == 409)
    assert duplicate.json()["detail"]["code"] == "NICKNAME_TAKEN"
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `PYTHONPATH=backend ./.venv/bin/pytest backend/tests/test_guests.py::test_duplicate_nickname_is_rejected_within_same_event backend/tests/test_guests.py::test_concurrent_duplicate_registration_creates_one_guest backend/tests/test_album.py::test_album_rejects_duplicate_nickname_without_event_token -q`

Expected: both tests fail because the endpoint currently returns `201` and the existing guest token.

- [ ] **Step 3: Return one duplicate error from both race paths**

Add a focused helper in `backend/app/routers/guests.py`:

```python
def nickname_taken_error():
    """Сообщает гостю, что нормализованный ник уже используется."""

    return api_error(409, "NICKNAME_TAKEN", "Этот ник уже занят. Придумайте другой.")
```

Change the pre-insert lookup to `raise nickname_taken_error()` and the `IntegrityError` duplicate branch to the same raise. Update the endpoint docstring so it no longer promises token reuse.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run: `PYTHONPATH=backend ./.venv/bin/pytest backend/tests/test_guests.py backend/tests/test_album.py -q`

Expected: all guest and album tests pass, including same-nickname registration in different events.

- [ ] **Step 5: Commit the API behavior**

```bash
git add backend/app/routers/guests.py backend/tests/test_guests.py backend/tests/test_album.py
git commit -m "Reject duplicate guest nicknames"
```

### Task 2: Show The Duplicate Error Inside The Welcome Dialog

**Files:**
- Create: `frontend/src/features/album/WelcomeDialog.test.tsx`
- Modify: `frontend/src/features/album/WelcomeDialog.tsx`
- Modify: `frontend/src/pages/AlbumPage.tsx`
- Modify: `frontend/src/styles/02-guest-album.css`

**Interfaces:**
- Consumes: `RequestError.code === "NICKNAME_TAKEN"` from `registerGuest`.
- Produces: `WelcomeDialog` prop `error?: string | null`; input uses `aria-invalid` and `aria-describedby="guest-nickname-error"` when an error exists.

- [ ] **Step 1: Write the failing dialog accessibility test**

```tsx
it("shows and associates a nickname registration error", () => {
  const html = renderToStaticMarkup(
    <WelcomeDialog
      nickname="Маша"
      saving={false}
      error="Этот ник уже занят. Придумайте другой."
      onNicknameChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="guest-nickname-error"');
  expect(html).toContain('id="guest-nickname-error"');
  expect(html).toContain('aria-live="polite"');
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `cd frontend && npm test -- src/features/album/WelcomeDialog.test.tsx`

Expected: TypeScript/test failure because `WelcomeDialog` does not accept `error`.

- [ ] **Step 3: Add inline error rendering and clearing**

Extend `WelcomeDialogProps` with `error?: string | null`, render:

```tsx
{error && (
  <p className="welcome-nickname-error" id="guest-nickname-error" aria-live="polite">
    {error}
  </p>
)}
```

Set `aria-invalid={Boolean(error)}` and `aria-describedby={error ? "guest-nickname-error" : undefined}` on the input. In `AlbumPage`, pass `error` to the dialog and call `setError(null)` inside `handleNicknameChange` before updating the nickname.

- [ ] **Step 4: Add restrained error styling**

```css
.welcome-nickname-error {
  margin: -4px 0 0;
  color: oklch(56% 0.18 27);
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1.3;
}

.welcome-dialog input[aria-invalid="true"] {
  border-color: oklch(65% 0.16 27);
  box-shadow: 0 0 0 3px oklch(65% 0.16 27 / 0.12);
}
```

- [ ] **Step 5: Run frontend tests and verify GREEN**

Run: `cd frontend && npm test -- src/features/album/WelcomeDialog.test.tsx src/api/client.test.ts && npm run typecheck`

Expected: focused tests and typecheck pass.

- [ ] **Step 6: Commit the welcome-dialog behavior**

```bash
git add frontend/src/features/album/WelcomeDialog.tsx frontend/src/features/album/WelcomeDialog.test.tsx frontend/src/pages/AlbumPage.tsx frontend/src/styles/02-guest-album.css
git commit -m "Show duplicate nickname errors during guest entry"
```

### Task 3: Increase Raffle Participant Readability

**Files:**
- Modify: `frontend/src/pages/RafflePage.test.ts`
- Modify: `frontend/src/styles/07-raffle-page.css`

**Interfaces:**
- Consumes: existing `.is-dense-list` class applied when `visibleParticipants.length > 20`.
- Produces: larger default rows and avatars while dense rows retain the compact base rules.

- [ ] **Step 1: Write a failing source-level CSS regression test**

```ts
it("keeps ordinary participant rows readable while preserving dense mode", () => {
  expect(raffleStyles).toMatch(/\.giveaway-participants-card:not\(\.is-dense-list\) \.giveaway-participant-row\s*\{[^}]*min-height:\s*48px/s);
  expect(raffleStyles).toMatch(/\.giveaway-participants-card:not\(\.is-dense-list\) \.giveaway-color-avatar\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/s);
  expect(raffleStyles).toMatch(/\.giveaway-participants-card:not\(\.is-dense-list\) \.giveaway-participant-copy strong\s*\{[^}]*font-size:\s*0\.9rem/s);
});
```

- [ ] **Step 2: Run the raffle test and verify RED**

Run: `cd frontend && npm test -- src/pages/RafflePage.test.ts`

Expected: failure because the current sizes are `42px`, `28px`, and `0.82rem`.

- [ ] **Step 3: Increase only the non-dense participant presentation**

In the existing `@media (min-width: 821px)` block set row `min-height: 48px`, avatar `34px`, nickname `0.9rem`, photo count `0.7rem`, and adjust the grid column/gap/padding proportionally. Do not change base dense-list rules or the two-column grid.

- [ ] **Step 4: Run the raffle test and verify GREEN**

Run: `cd frontend && npm test -- src/pages/RafflePage.test.ts && npm run typecheck`

Expected: raffle tests and typecheck pass.

- [ ] **Step 5: Commit the raffle sizing**

```bash
git add frontend/src/pages/RafflePage.test.ts frontend/src/styles/07-raffle-page.css
git commit -m "Increase raffle participant readability"
```

### Task 4: Verify And Deploy

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed API, dialog, and raffle changes.
- Produces: tested GitHub and production deployment.

- [ ] **Step 1: Run the full project check**

Run: `make check`

Expected: Ruff, all backend tests, all frontend tests, TypeScript, Vite production build, and npm audit pass.

- [ ] **Step 2: Inspect desktop and mobile browser layouts**

Run the local Vite app against the production-compatible backend. At `1440x900`, verify larger participant rows and no raffle overflow. At `390x844`, submit a known duplicate nickname and verify the message appears inside the dialog without horizontal overflow.

- [ ] **Step 3: Push and deploy**

```bash
git push origin main
rsync -az --exclude='.git/' --exclude='.venv/' --exclude='frontend/node_modules/' --exclude='.pytest_cache/' --exclude='__pycache__/' --exclude='.env' ./ wedding-events-vps:/var/www/our-day-dv.ru/events-app/
ssh wedding-events-vps 'set -e; chown -R www-data:www-data /var/www/our-day-dv.ru/events-app; systemctl restart wedding-events; nginx -t'
```

- [ ] **Step 4: Verify production**

Confirm `/events/`, `/events/raffle`, and `/api/album` return `200`, duplicate `POST /api/guests` returns `409 NICKNAME_TAKEN`, and `wedding-events`, `nginx`, and `postgresql` are active with no fresh warning logs.
