## 2024-08-25 - Timing Attack Protection for Cron Secrets
**Vulnerability:** The application was using simple string comparison (`provided !== secret`) to validate the cron authorization token in `app/api/cron/expire-documents/route.ts`. This was vulnerable to timing attacks.
**Learning:** Even internal API secrets like cron tokens need constant-time string comparison to prevent character-by-character guessing through timing side channels.
**Prevention:** Use `crypto.timingSafeEqual()` for comparing sensitive tokens, ensuring both strings are the same length before comparison to avoid TypeErrors.
