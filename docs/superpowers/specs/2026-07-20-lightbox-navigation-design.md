# Cyclic Lightbox Navigation

## Goal

Allow guests and administrators to browse the current media collection without closing the enlarged preview between files.

## Interaction

- Previous and next buttons are placed at the horizontal sides of the displayed media.
- Navigation wraps cyclically: previous from the first item opens the last, and next from the last opens the first.
- Arrow Left and Arrow Right provide the same behavior from the keyboard; Escape continues to close the dialog.
- A horizontal touch swipe changes the item when the gesture passes a deliberate distance threshold. Vertical scrolling or small taps do not navigate.
- Navigation includes both photos and videos in their current visible ordering.
- Controls are hidden when the collection contains fewer than two navigable items.
- Every navigation button has an accessible name and a minimum `44px` touch target.

## Component Contract

- `PhotoLightbox` receives a collection of `LightboxPhoto` items, an active index, an index-change callback, and the existing close callback.
- The component owns interaction mechanics but not page collection state.
- Gallery, album, personal photos, recent admin media, and admin photo grids each open the lightbox with the collection that contains the selected item.
- Changing the active index remounts video playback so the previous video stops automatically.

## Performance

- The previous and next image are preloaded while the dialog is open.
- Video files are not preloaded beyond their existing metadata behavior.
- Navigation callbacks and mapped lightbox collections are memoized by their owning pages.

## Responsive Layout

- Desktop controls sit outside or over the left and right media edges without resizing the media.
- Mobile controls remain visible but compact, with safe-area-aware positioning and no horizontal page overflow.
- Swipe remains available even when the arrows are visually close to the screen edge.

## Testing

- Component tests cover cyclic index calculation, keyboard navigation, control visibility, and accessible labels.
- Gesture logic is extracted into a small pure helper and tested at threshold boundaries.
- Page source tests ensure every lightbox call site supplies a media collection and selected index.
- Browser checks cover desktop arrows and mobile swipes with mixed image/video collections.
