import { z } from 'zod'

export const LISTING_TYPES = ['identified', 'generic'] as const
export type ListingType = (typeof LISTING_TYPES)[number]

export const PART_CONDITIONS = ['new', 'used', 'refurbished', 'oem_takeoff'] as const

/** Normalize cross-reference numbers (comma / newline separated). */
export function parseAlternativeNumbers(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of raw.split(/[\n,;]+/)) {
    const value = token.trim().toUpperCase()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out.slice(0, 20)
}

export function formatAlternativeNumbers(values: string[] | undefined): string {
  return (values || []).join(', ')
}

export const sellerPartSchema = z
  .object({
    listing_type: z.enum(LISTING_TYPES),
    title: z.string().min(1, 'titleRequired'),
    description: z.string().optional(),
    category: z.coerce.number().min(1, 'categoryRequired'),
    condition: z.enum(PART_CONDITIONS),
    price: z.coerce.number().min(0),
    quantity: z.coerce.number().min(1),
    currency: z.string().min(3).max(3).default('EUR'),
    brand: z.string().optional(),
    part_number: z.string().optional(),
    oem_number: z.string().optional(),
    alternative_numbers_text: z.string().optional(),
    location_city_override: z.string().optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.listing_type === 'identified') {
      const pn = (data.part_number || '').trim()
      const oem = (data.oem_number || '').trim()
      if (!pn && !oem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'identifierRequired',
          path: ['oem_number'],
        })
      }
    }
  })

export type SellerPartFormValues = z.infer<typeof sellerPartSchema>

export function toPartPayload(values: SellerPartFormValues) {
  return {
    listing_type: values.listing_type,
    title: values.title.trim(),
    description: values.description?.trim() || '',
    category: values.category,
    condition: values.condition,
    price: values.price,
    quantity: values.quantity,
    currency: values.currency.toUpperCase(),
    brand: values.brand?.trim() || '',
    part_number: values.listing_type === 'identified' ? (values.part_number || '').trim().toUpperCase() : '',
    oem_number: values.listing_type === 'identified' ? (values.oem_number || '').trim().toUpperCase() : '',
    alternative_numbers:
      values.listing_type === 'identified'
        ? parseAlternativeNumbers(values.alternative_numbers_text || '')
        : [],
    location_city_override: values.location_city_override?.trim() || '',
    is_active: values.is_active ?? true,
  }
}

export type SparePartRecord = {
  id: string
  listing_type: ListingType
  listing_type_display?: string
  title: string
  description?: string
  category: number
  category_slug?: string
  category_name?: string
  condition: string
  quantity: number
  price: string | number
  currency: string
  brand?: string
  part_number?: string
  oem_number?: string
  alternative_numbers?: string[]
  location_city_override?: string
  is_active?: boolean
}

export function partToFormValues(part: SparePartRecord): SellerPartFormValues {
  return {
    listing_type: part.listing_type || 'generic',
    title: part.title,
    description: part.description || '',
    category: part.category,
    condition: part.condition as SellerPartFormValues['condition'],
    price: Number(part.price),
    quantity: part.quantity,
    currency: part.currency || 'EUR',
    brand: part.brand || '',
    part_number: part.part_number || '',
    oem_number: part.oem_number || '',
    alternative_numbers_text: formatAlternativeNumbers(part.alternative_numbers),
    location_city_override: part.location_city_override || '',
    is_active: part.is_active !== false,
  }
}
