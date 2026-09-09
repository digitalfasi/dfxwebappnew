# Billing

## What this module does
Selling to customers: creating a new sale/bill and viewing past sales. Shared billing logic lives at the top; the two screens live in sub-folders.

## Files here
- billingService.js -> creates sales and loads sales/bills from the backend (used by new-sale, sale-history, and also by the payments screen).

## Key logic
- new-sale/ = ring up a new bill.
- sale-history/ = look back at bills already made.
The Payments screen's "Business Payment" data actually comes from here (a sale IS the bill being paid), which is why billingService is shared.

