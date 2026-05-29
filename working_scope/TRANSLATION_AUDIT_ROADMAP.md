# Translation Audit Roadmap

> Goal: every string a user can see — in the React app and any DB-driven
> content — must be translatable, and we need automated coverage so a
> missing key fails CI, not a Slack message from a customer.
>
> Initial languages: **English (`en`)** and **Albanian (`sq`)**. Roadmap
> assumes more will be added later (Italian, German, Macedonian).

---

## 1. Current state — observations

| Area | Storage | Translated? |
|---|---|---|
| Frontend strings | `frontend/src/locales/{en,sq}.json` (i18next) | Mostly |
| Service catalog | `visits.ServiceCatalogTranslation` (`name_en`, `name_sq`, …) | Yes — but no fallback audit |
| Inspection items | hard-coded in `visits/inspection_section_items.py` | No — English only |
| Report labels | `visits/report_labels.py` (per-PDF dict) | Yes |
| Email subjects/bodies | scattered through views | No (English only) |
| Notification toasts | mixed: `t(...)` and string literals | Partial |
| Audit / log entity labels | model TextChoices second tuple | English only |
| Onboarding application form | hard-coded English | No |
| Date / number formatting | `toLocaleString()` no fixed locale | Inconsistent |
| Currency symbols | per-tenant or hard-coded `EUR` | Partially |

The pattern is: anything user-driven that already lives in i18next is fine,
anything that bypassed i18next or the catalog translation table is the gap.

---

## 2. Tooling we will add (one PR per row)

### 2.1 Frontend — static key audit

A small Node script `scripts/i18n-audit.mjs` that:

1. Walks `frontend/src` for `t("…")`, `t('…')`, `Trans i18nKey="…"`,
   and `useTranslation` calls.
2. Diffs the discovered keys against the union of `en.json` + `sq.json`.
3. Reports two error lists:
   - **Missing keys** — used in code but absent in one or more locales.
   - **Orphan keys** — present in JSON but never referenced.
4. Exits with code `1` if either list is non-empty in CI.

Wire into `npm run lint` and add a GitHub Action step:
`npm run i18n-audit`.

Bonus: `--fix` mode adds the missing keys to `sq.json` with the value
`"TODO[sq]: <english value>"` so reviewers can spot them quickly.

### 2.2 Frontend — runtime missing-key trap

```ts
i18n.init({
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (langs, ns, key) => console.warn(`[i18n] missing ${key} in ${langs}`),
})
```

In production, route this through the existing toast `showError` so QA
spots untranslated strings during smoke runs.

### 2.3 Frontend — string-literal hunt

A Babel/TS plugin or a simpler custom AST walker that flags JSX text nodes
containing user-facing characters but no `t(…)` wrapper. Because many
strings are placeholder/aria/error strings, the walker accepts an
allowlist file at `scripts/i18n-allowlist.txt`.

### 2.4 Backend — catalog completeness check

```python
class TranslationCoverageTests(TestCase):
    def test_all_service_catalog_entries_have_sq(self):
        missing = ServiceCatalog.objects.filter(translations__name_sq="").distinct()
        self.assertFalse(missing.exists(), missing)
```

Same shape for inspection sections + their items + email templates +
notification copy.

### 2.5 Backend — translatable-content audit endpoint

`GET /api/v1/admin/translation-coverage/` (superadmin-only):

```json
{
  "service_catalog": {"total": 142, "translated": {"en": 142, "sq": 138}},
  "inspection_items": {"total": 96, "translated": {"en": 96, "sq": 60}},
  "audit_entities": {"total": 7, "translated": {"en": 7, "sq": 0}},
  "missing": [
    {"area": "inspection", "id": "...", "label": "Front brake pad thickness"}
  ]
}
```

Surface this as a **Translation health** panel on the superadmin dashboard.

### 2.6 Backend — DB-content migration helpers

For data that was created in English and never re-translated (existing
production rows), a management command:

```bash
python manage.py i18n_seed_pending --target sq --copy-from en
```

Inserts placeholder translations so the UI never sees an empty string —
just a `[NOT TRANSLATED]` marker the QA team can search for.

### 2.7 CI gates

- `npm run i18n-audit` — required check on every PR.
- `manage.py test --tag=i18n` — runs the new coverage tests.
- Coverage report posted to PR description (deltas vs. main).

---

## 3. Phased rollout

| Phase | Scope | Effort |
|---|---|---|
| **P1** | Frontend static audit + missing-key warning + i18n-allowlist | 1 day |
| **P2** | Backend coverage tests for service catalog + inspections | 0.5 day |
| **P3** | Translation-coverage admin endpoint + dashboard panel | 0.5 day |
| **P4** | Email + notification copy migrated to translation tables | 1 day |
| **P5** | Audit / TextChoices labels translated | 0.5 day |
| **P6** | i18n_seed_pending + production backfill | 0.5 day |
| **P7** | Add Italian / German / Macedonian | per-language ~0.5 day |

Total for `en`/`sq` rigour: ~4 days.

---

## 4. Non-goals (explicit)

- Auto-translation via DeepL / Google. We collect TODOs and let humans
  fill them in. Auto-MT is a P-future feature.
- RTL languages — none in our market.
- Plural rules beyond what i18next ships out of the box.

---

## 5. Definition of done

1. CI fails when a new key is added in code without an `sq` value.
2. The superadmin can open `/admin/translation-coverage/` and see 100%
   for every shipping locale.
3. New devs follow `working_scope/I18N_GUIDE.md` (a small companion doc
   we'll write once the tooling is in place).
4. The `[NOT TRANSLATED]` marker never appears in the UI in any
   environment a customer can reach.
