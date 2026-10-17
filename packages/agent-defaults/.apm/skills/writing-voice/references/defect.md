# Defect identification/reporting mode

Shared core applies; no drafting/posting/resolution authority or history dependency.

- Observed vs expected behavior; known component/version; supplied errors,
  measurements, reproduction steps, and links. Flag absent/unverified reproduction.
- Supported impact/scope only; never invent affected users, production exposure,
  severity, or measurements.
- Separate verified defects from suspected causes/diagnosis. Name unknowns and
  next evidence that distinguishes causes. No invented reproduction, completed
  checks, or fixed outcome; a proposed check remains a proposal.

## Synthetic example

Private fixture, not a thread reply: final span expected before shutdown
returns, missing afterward; exporter logs/collector receipt unchecked.

> The final span is missing after shutdown, though it should export before
> shutdown returns. Exporter failure is only a hypothesis; logs and collector
> receipt would help distinguish export failure from shutdown timing.
