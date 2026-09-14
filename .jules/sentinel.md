
## 2024-09-14 - [Timing Attack in Cron Secret]
**Vulnerability:** Simple string comparison (`provided !== secret`) used to authenticate cron job execution.
**Learning:** `timingSafeEqual` must be used for all secret comparisons to prevent timing attacks, and lengths must be compared first to prevent `timingSafeEqual` from throwing when byte lengths differ.
**Prevention:** Use `crypto.timingSafeEqual` for all tokens and secret comparisons.
