## 2024-05-24 - [Enhancement] Added security headers
**Vulnerability:** Next.js application was lacking important security headers (like X-Frame-Options, Strict-Transport-Security), which could leave the app vulnerable to Clickjacking and other related attacks.
**Learning:** By adding a headers() function to next.config.ts, we can enforce these headers on all routes.
**Prevention:** Include security headers early in project configuration for Next.js applications using next.config.ts headers configuration.
