#!/usr/bin/env node
/**
 * Static i18n audit for the React frontend.
 *
 * Walks `frontend/src` for translation key usages (any of `t("…")`,
 * `t('…')`, `<Trans i18nKey="…">`), flattens every locale JSON into
 * dotted keys, and reports:
 *
 *   • MISSING — used in code but not defined in one or more locales
 *   • ORPHAN  — defined in JSON but not referenced anywhere in code
 *   • EMPTY   — defined as "" / null in some locale (treated as missing)
 *
 * Usage:
 *   node scripts/i18n-audit.mjs                   # report only
 *   node scripts/i18n-audit.mjs --fix             # write TODO[xx] stubs into other locales
 *   node scripts/i18n-audit.mjs --reference=en    # which locale is the source of truth
 *
 * Exit code 1 if MISSING or EMPTY in any locale.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const localeDir = path.join(repoRoot, 'frontend/src/locales')
const codeRoot = path.join(repoRoot, 'frontend/src')

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/)
    return m ? [m[1], m[2] ?? true] : [arg, true]
  }),
)
const FIX = Boolean(args.fix)
const REFERENCE = args.reference || 'en'

const PATTERNS = [
  /(?:^|[^A-Za-z0-9_$])t\(\s*(['"])([\w.\-]+)\1/g,
  /(?:^|[^A-Za-z0-9_$])tr\(\s*(['"])([\w.\-]+)\1/g,
  /<Trans[\s\S]*?i18nKey=(['"])([\w.\-]+)\1/g,
  /\btk\s*:\s*(['"])([\w.\-]+)\1/g,
]

// Dynamic-key patterns. We can't statically resolve interpolations so we
// capture every literal prefix that appears in `\`prefix.subkey.${var}\``
// — including the case where the template literal is assigned to a
// variable first and then passed to `t(key)`. Any prefix found this way
// suppresses orphan reports under it.
const DYNAMIC_PATTERN = /`([a-z][\w]*(?:\.[\w]+)*)\.\$\{/g

const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite', 'locales'])

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else {
      out[key] = v
    }
  }
  return out
}

function unflatten(map) {
  const out = {}
  for (const [key, value] of Object.entries(map)) {
    const parts = key.split('.')
    let cursor = out
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (typeof cursor[p] !== 'object' || cursor[p] === null) cursor[p] = {}
      cursor = cursor[p]
    }
    cursor[parts[parts.length - 1]] = value
  }
  return out
}

function loadLocale(name) {
  const p = path.join(localeDir, `${name}.json`)
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }
}

function discoverKeys() {
  const keys = new Map()
  const dynamicPrefixes = new Set()
  for (const file of walk(codeRoot)) {
    const src = fs.readFileSync(file, 'utf8')
    for (const re of PATTERNS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(src)) !== null) {
        const key = m[2]
        if (!keys.has(key)) keys.set(key, new Set())
        keys.get(key).add(path.relative(repoRoot, file))
      }
    }
    DYNAMIC_PATTERN.lastIndex = 0
    let dm
    while ((dm = DYNAMIC_PATTERN.exec(src)) !== null) {
      dynamicPrefixes.add(dm[1])
    }
  }
  return { keys, dynamicPrefixes }
}

function main() {
  const { keys: usedKeys, dynamicPrefixes } = discoverKeys()
  const localeFiles = fs
    .readdirSync(localeDir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.replace(/\.json$/, ''))
  if (!localeFiles.includes(REFERENCE)) {
    console.error(`Reference locale "${REFERENCE}" not found in ${localeDir}`)
    process.exit(2)
  }
  const locales = Object.fromEntries(localeFiles.map((n) => [n, loadLocale(n)]))
  const flat = Object.fromEntries(
    Object.entries(locales).map(([n, { data }]) => [n, flatten(data)]),
  )
  const refKeys = new Set(Object.keys(flat[REFERENCE]))

  const issues = { missing: {}, empty: {}, orphan: [] }

  for (const [key] of usedKeys) {
    for (const locale of localeFiles) {
      const value = flat[locale][key]
      if (value === undefined) {
        ;(issues.missing[locale] ??= []).push(key)
      } else if (value === null || value === '') {
        ;(issues.empty[locale] ??= []).push(key)
      }
    }
  }

  // Skip orphans whose prefix is reached via a dynamic `t(\`prefix.${x}\`)`.
  const isCoveredByDynamic = (key) => {
    for (const prefix of dynamicPrefixes) {
      if (key.startsWith(prefix + '.')) return true
    }
    return false
  }
  for (const key of refKeys) {
    if (!usedKeys.has(key) && !isCoveredByDynamic(key)) {
      issues.orphan.push(key)
    }
  }

  let hardFails = 0
  for (const locale of localeFiles) {
    const m = (issues.missing[locale] || []).length
    const e = (issues.empty[locale] || []).length
    hardFails += m + e
  }

  console.log(`\nLocales: ${localeFiles.join(', ')}  (reference: ${REFERENCE})`)
  console.log(`Used keys: ${usedKeys.size} (+ ${dynamicPrefixes.size} dynamic prefix(es))`)
  for (const locale of localeFiles) {
    console.log(`  ${locale}.json: ${Object.keys(flat[locale]).length} defined`)
  }

  for (const locale of localeFiles) {
    const m = issues.missing[locale] || []
    const e = issues.empty[locale] || []
    if (!m.length && !e.length) continue
    console.log(`\n${locale} — ${m.length} missing, ${e.length} empty:`)
    for (const k of m.sort()) console.log(`   MISSING ${k}`)
    for (const k of e.sort()) console.log(`   EMPTY   ${k}`)
  }

  if (issues.orphan.length) {
    console.log(`\nOrphans in ${REFERENCE}.json (defined but never referenced): ${issues.orphan.length}`)
    for (const k of issues.orphan.sort().slice(0, 50)) console.log(`   ORPHAN  ${k}`)
    if (issues.orphan.length > 50) console.log(`   … and ${issues.orphan.length - 50} more`)
  }

  if (FIX && hardFails > 0) {
    console.log('\n--fix: writing TODO stubs to non-reference locales…')
    for (const locale of localeFiles) {
      if (locale === REFERENCE) continue
      const flatLocale = { ...flat[locale] }
      let added = 0
      for (const k of issues.missing[locale] || []) {
        flatLocale[k] = `TODO[${locale}]: ${flat[REFERENCE][k] ?? ''}`
        added++
      }
      for (const k of issues.empty[locale] || []) {
        flatLocale[k] = `TODO[${locale}]: ${flat[REFERENCE][k] ?? ''}`
        added++
      }
      if (added > 0) {
        const data = unflatten(flatLocale)
        fs.writeFileSync(locales[locale].path, JSON.stringify(data, null, 2) + '\n')
        console.log(`   ${locale}.json — added/filled ${added} stub(s)`)
      }
    }
  }

  if (hardFails > 0) {
    console.log(`\n  ${hardFails} translation issue(s).`)
    process.exit(1)
  }
  console.log('\n  No translation gaps in shipping locales.')
}

main()
