# Vardhan Order Tracker

Phase 1 prototype for Vardhan Steelware. It answers one question: which order is stuck where.

Needs Node 16 or newer. No packages to install.

    npm start

Open http://localhost:3000 (on the same wifi, use the laptop's IP from a phone).

The first run creates `data/db.json` with sample orders taken from the September sheet. Delete that file to reset.

What is in it:
- Orders with unique IDs, stages, partial dispatch and a hold reason
- Duplicate warning when the same party, item and quantity is still open
- Karigar polish lots: kg sent, pieces back, kg short
- Today screen with pending by stage, holds, and polish reconciliation
- Suresh sees everything but cannot edit; Kunal, Ramesh and Munshi ji can

Out on purpose: marketplace integrations, forecasting, accounts and Tally sync, logins.
The role picker is not security. Real login comes before this goes live.
