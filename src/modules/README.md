# Modules - the feature map

Each folder here is one feature area of the admin app. If a screen misbehaves, this map tells you which folder to open.

- Dashboard (home numbers) -> dashboard/
- Gold rate bug / setting the rate -> gold-rate/
- Customer records -> customers/
- Savings plans -> plan/  (plan templates in plan/scheme/, a customer's membership in plan/enrollment/)
- Stock we hold -> procurement/inventory/
- Buying from vendors -> procurement/purchase-history/
- Ringing up a sale -> billing/new-sale/
- Past sales -> billing/sale-history/
- Shared sale logic -> billing/billingService.js
- Recording payments (scheme installments AND bill payments) -> payments/
- Product catalogue -> catalogue-studio/
- Promotions and banners -> marketing/
- Reports and charts -> reports/
- Branch locations -> branches/
- Staff accounts -> staff/
- Support desk -> support/
- Notifications -> notifications/
- App settings -> settings/

Shared plumbing used by all of the above (backend connection, login, sidebar, buttons) lives in ../_shared/.

