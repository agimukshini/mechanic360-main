import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, MapPin, MessageCircle, Phone, Mail, Sparkles } from 'lucide-react'
import { marketplaceApi, type SparePart } from '@/api'
import { formatEuro } from '@/lib/money'
import { unwrapList } from '@/lib/utils'

type Props = {
  vehicleId: string
}

export default function MarketplaceBanner({ vehicleId }: Props) {
  const { t } = useTranslation()
  const [issueSlug, setIssueSlug] = useState('')

  const { data: issuesData } = useQuery({
    queryKey: ['marketplace-issues'],
    queryFn: () => marketplaceApi.listIssues(),
  })

  const issues = unwrapList<{ slug: string; name: string }>(issuesData)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['marketplace-recommendations', vehicleId, issueSlug],
    queryFn: () => marketplaceApi.recommendations(vehicleId, issueSlug),
    enabled: Boolean(vehicleId && issueSlug),
  })

  const parts: SparePart[] = data?.data?.parts || []
  const eventId: string | undefined = data?.data?.banner_event_id
  const compatibilityConfirmed: boolean = data?.data?.compatibility_confirmed ?? false

  const trackClick = async (partId: string) => {
    if (!eventId) return
    try {
      await marketplaceApi.bannerClick(eventId, partId)
    } catch {
      /* best-effort telemetry */
    }
  }

  const trackContact = async () => {
    if (!eventId) return
    try {
      await marketplaceApi.bannerContact(eventId)
    } catch {
      /* best-effort */
    }
  }

  return (
    <div className="card p-5 space-y-4 border border-accent/20 bg-accent/5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-workshop-charcoal flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            {t('marketplaceBanner.title')}
          </h2>
          <p className="text-sm text-workshop-charcoal/60 mt-1">{t('marketplaceBanner.subtitle')}</p>
        </div>
        <select
          value={issueSlug}
          onChange={(e) => setIssueSlug(e.target.value)}
          className="input w-full sm:w-auto min-w-[220px]"
        >
          <option value="">{t('marketplaceBanner.selectIssue')}</option>
          {issues.map((issue) => (
            <option key={issue.slug} value={issue.slug}>
              {issue.name}
            </option>
          ))}
        </select>
      </div>

      {!issueSlug ? (
        <p className="text-sm text-workshop-charcoal/50">{t('marketplaceBanner.pickIssue')}</p>
      ) : isLoading || isFetching ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : parts.length === 0 ? (
        <p className="text-sm text-workshop-charcoal/60">{t('marketplaceBanner.empty')}</p>
      ) : (
        <>
          {!compatibilityConfirmed && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {t('marketplaceBanner.categoryFallback')}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {parts.map((part) => (
              <article
                key={part.id}
                className="w-full card p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-snug line-clamp-2">{part.title}</h3>
                  {part.is_sponsored && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                      {t('marketplaceBanner.sponsored')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-workshop-charcoal/60 line-clamp-2">
                  {part.description || part.category_name}
                </p>
                <p className="text-lg font-bold text-accent">
                  {formatEuro(Number(part.price))}
                  <span className="text-xs font-normal text-workshop-charcoal/50 ml-1">
                    {part.currency}
                  </span>
                </p>
                <div className="text-xs text-workshop-charcoal/60 space-y-1">
                  <p className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {part.seller_name}
                    {part.seller_city ? ` · ${part.seller_city}` : ''}
                  </p>
                  {compatibilityConfirmed && (
                    <p className="text-green-700">{t('marketplaceBanner.compatible')}</p>
                  )}
                </div>
                <div className="flex gap-2 mt-auto pt-2">
                  <Link
                    to="/marketplace"
                    onClick={() => trackClick(part.id)}
                    className="btn btn-outline btn-sm flex-1"
                  >
                    {t('marketplaceBanner.viewListing')}
                  </Link>
                  {(part.contact_phone || part.contact_whatsapp) && (
                    <a
                      href={
                        part.contact_whatsapp
                          ? `https://wa.me/${part.contact_whatsapp.replace(/\D/g, '')}`
                          : `tel:${part.contact_phone}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        trackClick(part.id)
                        trackContact()
                      }}
                      className="btn btn-primary btn-sm"
                      aria-label={t('marketplaceBanner.contact')}
                    >
                      {part.contact_whatsapp ? (
                        <MessageCircle className="w-4 h-4" />
                      ) : (
                        <Phone className="w-4 h-4" />
                      )}
                    </a>
                  )}
                  {part.contact_email && !part.contact_phone && !part.contact_whatsapp && (
                    <a
                      href={`mailto:${part.contact_email}`}
                      onClick={() => {
                        trackClick(part.id)
                        trackContact()
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
