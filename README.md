<p align="center">
  <img src="public/brand/core-app-icon.svg" alt="core. app icon" width="120" />
</p>

<h3 align="center">core.</h3>

<p align="center">
  The private operations app behind Science By Hugs.
</p>

---

## core.

core. is the internal Science By Hugs app for operational work across orders, fulfillment, customers, catalog, inventory, finance, analytics, referrals, notifications, administration and audit activity.

### Brand

core. follows the **Science By Hugs Design System** (theme `core`, Sage): a rounded lowercase c. with the family dot, sage `#8FB89E` on green-black `#0F1412`, the system font, and flat surfaces. Tokens live in `src/brand.css`; don't hard-code colors anywhere else.

### Platform

- Vite + TypeScript
- Supabase integration
- Installable PWA
- Responsive desktop and mobile operations UI
- Role-gated administrative access
- Science By Hugs Design System, core. Sage theme

### Development

```bash
npm install
npm run dev
npm run build
```

---


## 2.0 staging development branch

This branch is staging-only and must not be merged into production main. Read [Day 1 setup](docs/V2-DAY1.md), [beta scope](docs/V2-BETA-SCOPE.md), and [staging plan](docs/V2-STAGING-PLAN.md) before running or provisioning it. Explicit staging settings are required; CI builds fixtures without deploying.
