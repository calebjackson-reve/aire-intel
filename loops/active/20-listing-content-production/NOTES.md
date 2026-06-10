# Loop: listing-content-production — Handoff Notes

## Spec Summary
Extends content-scheduler agent: after rotating content logic, checks for new Paragon listings without a ContentProject. For each new listing (max 3), generates carousel + caption + reel hook and creates an ActionQueue post_content item.

## Definition of Done (from SPEC.md)
- content-scheduler route has listing content pass after existing rotating logic
- ContentProject.mlsId field exists (or noted as needing migration)
- ActionQueue dedup check on payload.mlsId
- Max 3 listing posts per day enforced via getSetting
- `npx tsc --noEmit` and `npm run build` both pass

## Iteration Log

### Iteration 0 — scaffolded, nothing started
**Next:** Read prisma/schema.prisma for ContentProject model. Check for mlsId field.
