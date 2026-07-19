# Unique Guest Nicknames And Larger Raffle Participants

## Goal

Make participants easier to read on the raffle page and prevent two guests in the same album from using visually identical nicknames.

## Nickname Rules

- Nicknames are unique within the active event.
- Comparison uses the existing normalized nickname: surrounding whitespace is removed, repeated spaces are collapsed, and letter case is ignored.
- The same normalized nickname remains allowed in different events.
- A duplicate registration returns HTTP `409` with code `NICKNAME_TAKEN` and the message `Этот ник уже занят. Придумайте другой.`
- The API never returns another guest's token for a duplicate nickname.
- Concurrent requests for the same nickname are handled by the database uniqueness constraint and produce the same `409` response.

## Guest Interface

- The welcome dialog receives and displays the registration error directly below the nickname field.
- The duplicate message is announced through `aria-live` and associated with the input through `aria-describedby`.
- On any nickname edit, the stale registration error is cleared.
- Existing valid local sessions continue to work without re-registering.

## Raffle Participant List

- For ordinary lists of up to 20 visible participants, increase row height, avatar size, nickname size, and photo-count size slightly.
- Keep the existing two-column layout.
- For lists above 20 participants, retain the compact density so up to 40 guests remain practical on a television screen.
- Long nicknames continue to use ellipsis and do not resize the grid.

## Testing

- Backend tests cover case-insensitive duplicate rejection, concurrent uniqueness fallback, and same-nickname registration across different events.
- Frontend tests cover rendering the duplicate error in the welcome dialog and clearing it after input changes.
- Existing raffle CSS/source tests are extended to protect the readable sizes and compact-mode boundary.
- Run the full project check and inspect the raffle and welcome dialog in desktop and mobile browser viewports before deployment.
