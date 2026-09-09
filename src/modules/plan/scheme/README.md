# Plan > Scheme (the plan templates)

## What this module does
Defines the savings-plan templates the shop offers and the rules for valuing a contribution in gold.

## Files here
- Schemes.jsx -> the screen to view and manage plan templates.
- schemeService.js -> loads/saves plan templates from the backend; also lists the scheme types.
- schemeDue.js -> works out installment due-dates and which ones a customer has missed.

## Key logic
There are three scheme types (MONTHLY, FLEXIBLE_DIGI_GOLD, FIXED_GOLD_RATE) and each values a contribution in gold differently. schemeDue.js only calculates the due-date schedule for display; it does not move any money.

