# Mobile restart confirmation design

## Problem

On the presentation script screen, selecting **從 P1 重新開始** from the top-right menu works on desktop Chrome but appears to do nothing on mobile Chrome. The action currently closes the React menu and immediately invokes the browser-native `confirm()` dialog. Mobile browser handling of native dialogs during UI teardown is unreliable, so the destructive action can become inaccessible without any visible feedback.

## Decision

Replace the native confirmation used by **從 P1 重新開始** with an in-page confirmation dialog. Keep the existing restart behavior unchanged after confirmation: clear the current Q&A, reset elapsed time, select P1, and continue the presentation timer.

The change stays scoped to this action. Other native confirmations are not changed unless implementation reveals that a small reusable dialog abstraction is necessary without expanding behavior.

## Interaction

1. The user opens the top-right menu and selects **從 P1 重新開始**.
2. The menu closes and an in-page modal dialog appears above the script UI.
3. The dialog clearly warns that timing and all Q&A will be cleared.
4. **取消** closes the dialog and leaves the session unchanged.
5. **重新開始** closes the dialog, clears Q&A, resets the session, and returns to P1 with the timer running.

The dialog uses native button elements, `role="alertdialog"`, an accessible name and description, and a backdrop that prevents interaction with the script while the decision is pending. Escape and backdrop dismissal should behave like cancel when practical.

## Verification

- Add a mobile-viewport UI regression that opens the top-right menu and selects **從 P1 重新開始**.
- Verify the in-page confirmation becomes visible.
- Verify cancel preserves the current slide and elapsed session.
- Verify confirm returns to P1 and restarts elapsed time.
- Run lint, the relevant UI smoke test, and a production build when credentials/environment permit.
