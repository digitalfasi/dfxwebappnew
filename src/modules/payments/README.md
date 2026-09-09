# Payments

## What this module does
Recording money received. Two different kinds of payment are handled here.

## Files here
- Payments.jsx -> the payments screen (list and record payments).
- paymentService.js -> loads/saves payment records from the backend.
- components/ -> the two "record a payment" pop-up forms. See its own README.

## Key logic
Two payment kinds:
1. Scheme Payment = a monthly installment against a customer's savings plan (enrollment).
2. Business Payment = payment for a sale/bill; its underlying data actually comes from the BILLING module (a sale is the thing being paid), which is why this screen also uses billingService.
When a Scheme Payment is recorded, the FRONTEND does NOT decide how many months the money covers. It just sends the amount; the BACKEND works out how many installments that amount clears.

