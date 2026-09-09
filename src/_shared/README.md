# Shared (`_shared`)

## What this module does
Reusable building blocks used by every feature module: the connection to the backend, the login/session handling, the app frame (sidebar and top bar), small helpers, and the shared visual components. If something is used by more than one feature, it lives here.

## Files here
- apiClient.js -> the single place that talks to the backend server (adds the login token, handles session-expiry).
- authService.js -> login, logout and "who am I" calls.
- AuthContext.jsx -> remembers the logged-in user across the whole app.
- AuthGate.jsx -> shows the login screen until the user signs in, then shows the app.
- Sidebar.jsx -> the left-hand navigation menu.
- TopBar.jsx -> the bar across the top (search, user menu).
- toast.js -> the little pop-up notifications ("Saved", "Error", etc.).
- utils.js -> tiny helpers, e.g. formatting money as Indian Rupees.
- collector.js -> server-side helper that fetches live gold rates from external sources.
- api.js -> old sample/mock data for the dashboard (not wired to anything live; kept for reference).
- passbookService.js -> fetches a customer's scheme "passbook" history from the backend.
- usePageMotion.js -> the page entrance animations and button press feedback.
- ComingSoon.jsx -> placeholder screen for features not built yet.
- ui/ -> the shared visual components (buttons, cards, inputs). See its own README.

## Key logic
apiClient.js is the only file that knows the backend address and login token, so every other file goes through it. That keeps authentication in one place.

