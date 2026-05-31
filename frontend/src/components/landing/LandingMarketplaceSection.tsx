import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, ShoppingBag, Store, Users } from 'lucide-react'

type BenefitCardProps = {
  icon: React.ReactNode
  title: string
  body: string
  accent: 'amber' | 'sky' | 'violet'
}

function BenefitCard({ icon, title, body, accent }: BenefitCardProps) {
  const styles = {
    amber: {
      ring: 'border-amber-400/30 bg-amber-500/10 shadow-amber-500/10',
      icon: 'bg-amber-500/20 text-amber-300',
    },
    sky: {
      ring: 'border-sky-400/30 bg-sky-500/10 shadow-sky-500/10',
      icon: 'bg-sky-500/20 text-sky-300',
    },
    violet: {
      ring: 'border-violet-400/30 bg-violet-500/10 shadow-violet-500/10',
      icon: 'bg-violet-500/20 text-violet-300',
    },
  }[accent]

  return (
    <div
      className={`relative rounded-2xl border p-5 backdrop-blur-sm shadow-lg transition-transform hover:-translate-y-0.5 ${styles.ring}`}
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${styles.icon}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
    </div>
  )
}

export default function LandingMarketplaceSection() {
  const { t } = useTranslation()

  const benefits = [
    {
      icon: <Store className="h-5 w-5" />,
      title: t('landing.marketplace.sellTitle'),
      body: t('landing.marketplace.sellBody'),
      accent: 'amber' as const,
    },
    {
      icon: <ShoppingBag className="h-5 w-5" />,
      title: t('landing.marketplace.buyTitle'),
      body: t('landing.marketplace.buyBody'),
      accent: 'sky' as const,
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: t('landing.marketplace.networkTitle'),
      body: t('landing.marketplace.networkBody'),
      accent: 'violet' as const,
    },
  ]

  return (
    <section className="border-t border-white/10 pt-12 lg:pt-16">
      <div className="mb-8 text-center lg:text-left">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-amber-300">
          {t('landing.marketplace.eyebrow')}
        </p>
        <h2 className="text-3xl font-bold lg:text-4xl">{t('landing.marketplace.title')}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-400 lg:mx-0">{t('landing.marketplace.subtitle')}</p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-slate-900/40 to-violet-500/10 p-6 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-400/10 blur-3xl" />

        <div className="relative mb-6 flex flex-col items-center gap-3 text-center lg:flex-row lg:text-left">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <ArrowLeftRight className="h-7 w-7 text-amber-200" />
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-300 lg:text-base">
            {t('landing.marketplace.highlight')}
          </p>
        </div>

        <div className="relative grid gap-4 md:grid-cols-3">
          {benefits.map((benefit) => (
            <BenefitCard key={benefit.title} {...benefit} />
          ))}
        </div>
      </div>
    </section>
  )
}
