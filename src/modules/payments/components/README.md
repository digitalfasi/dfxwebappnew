# Payments > Components

## What this module does
The two pop-up forms used to record a payment by hand.

## Files here
- SchemeManualPaymentModal.jsx -> record a monthly scheme installment for a customer.
- BusinessManualPaymentModal.jsx -> record a payment against a sale/bill (its data comes from the billing module).

## Key logic
For scheme payments the form sends only the amount paid; the backend derives how many installments that clears, so the form never sends a fixed month count.

