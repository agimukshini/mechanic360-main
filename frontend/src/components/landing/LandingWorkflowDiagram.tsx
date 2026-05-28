import { useTranslation } from 'react-i18next'
import {
  Building2,
  Car,
  ClipboardCheck,
  History,
  QrCode,
  UserPlus,
  Wrench,
} from 'lucide-react'

type NodeProps = {
  icon: React.ReactNode
  title: string
  body: string
  accent: 'blue' | 'emerald'
}

function FlowNode({ icon, title, body, accent }: NodeProps) {
  const ring =
    accent === 'blue'
      ? 'border-blue-400/30 bg-blue-500/10 shadow-blue-500/10'
      : 'border-emerald-400/30 bg-emerald-500/10 shadow-emerald-500/10'
  const iconBg = accent === 'blue' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'

  return (
    <div
      className={`relative rounded-2xl border p-5 backdrop-blur-sm shadow-lg transition-transform hover:-translate-y-0.5 ${ring}`}
    >
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{body}</p>
    </div>
  )
}

function HubNode({ title, body, workshopTag, ownerTag }: { title: string; body: string; workshopTag: string; ownerTag: string }) {
  return (
    <div className="relative flex h-full min-h-[280px] flex-col items-center justify-center rounded-3xl border border-violet-400/40 bg-gradient-to-b from-violet-500/20 via-blue-500/15 to-emerald-500/15 p-6 text-center shadow-2xl shadow-violet-500/10 backdrop-blur-md">
      <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.25),transparent_55%)]" />
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
        <Car className="h-8 w-8 text-violet-200" />
      </div>
      <h3 className="relative text-lg font-bold text-white">{title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
      <div className="relative mt-5 flex gap-2">
        <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-200 ring-1 ring-blue-400/30">
          {workshopTag}
        </span>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/30">
          {ownerTag}
        </span>
      </div>
    </div>
  )
}

function ConnectionLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      viewBox="0 0 960 420"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="line-blue" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="line-emerald" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* Workshop → hub */}
      <path
        d="M 280 70 C 360 70, 400 210, 430 210"
        fill="none"
        stroke="url(#line-blue)"
        strokeWidth="2"
        strokeDasharray="6 6"
        className="animate-[dash_20s_linear_infinite]"
      />
      <path
        d="M 280 210 C 360 210, 400 210, 430 210"
        fill="none"
        stroke="url(#line-blue)"
        strokeWidth="2.5"
      />
      <path
        d="M 280 350 C 360 350, 400 210, 430 210"
        fill="none"
        stroke="url(#line-blue)"
        strokeWidth="2"
        strokeDasharray="6 6"
        className="animate-[dash_20s_linear_infinite]"
      />

      {/* Hub → owner */}
      <path
        d="M 530 210 C 560 210, 600 70, 680 70"
        fill="none"
        stroke="url(#line-emerald)"
        strokeWidth="2"
        strokeDasharray="6 6"
        className="animate-[dash_20s_linear_infinite]"
      />
      <path
        d="M 530 210 C 560 210, 600 210, 680 210"
        fill="none"
        stroke="url(#line-emerald)"
        strokeWidth="2.5"
      />
      <path
        d="M 530 210 C 560 210, 600 350, 680 350"
        fill="none"
        stroke="url(#line-emerald)"
        strokeWidth="2"
        strokeDasharray="6 6"
        className="animate-[dash_20s_linear_infinite]"
      />

      {/* Connection dots */}
      {[
        [280, 70],
        [280, 210],
        [280, 350],
        [680, 70],
        [680, 210],
        [680, 350],
        [480, 210],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#c4b5fd" opacity="0.9" />
      ))}
    </svg>
  )
}

export default function LandingWorkflowDiagram() {
  const { t } = useTranslation()

  const workshopSteps = [
    {
      icon: <UserPlus className="h-5 w-5" />,
      title: t('landing.workflow.workshop1Title'),
      body: t('landing.workflow.workshop1Body'),
    },
    {
      icon: <ClipboardCheck className="h-5 w-5" />,
      title: t('landing.workflow.workshop2Title'),
      body: t('landing.workflow.workshop2Body'),
    },
    {
      icon: <Wrench className="h-5 w-5" />,
      title: t('landing.workflow.workshop3Title'),
      body: t('landing.workflow.workshop3Body'),
    },
  ]

  const ownerSteps = [
    {
      icon: <QrCode className="h-5 w-5" />,
      title: t('landing.workflow.owner1Title'),
      body: t('landing.workflow.owner1Body'),
    },
    {
      icon: <Car className="h-5 w-5" />,
      title: t('landing.workflow.owner2Title'),
      body: t('landing.workflow.owner2Body'),
    },
    {
      icon: <History className="h-5 w-5" />,
      title: t('landing.workflow.owner3Title'),
      body: t('landing.workflow.owner3Body'),
    },
  ]

  return (
    <section className="py-16 lg:py-24">
      <div className="mb-12 text-center lg:text-left">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-300">
          {t('landing.workflow.eyebrow')}
        </p>
        <h2 className="text-3xl font-bold lg:text-4xl">{t('landing.workflow.title')}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-400 lg:mx-0">{t('landing.workflow.subtitle')}</p>
      </div>

      {/* Desktop diagram */}
      <div className="relative hidden lg:block">
        <ConnectionLines />

        <div className="relative grid grid-cols-[1fr_220px_1fr] items-center gap-x-6 gap-y-10">
          <div className="col-start-1 row-start-1 flex items-center gap-2 text-sm font-semibold text-blue-300">
            <Building2 className="h-4 w-4" />
            {t('landing.workflow.workshopLabel')}
          </div>
          <div className="col-start-3 row-start-1 flex items-center justify-end gap-2 text-sm font-semibold text-emerald-300">
            {t('landing.workflow.ownerLabel')}
            <Car className="h-4 w-4" />
          </div>

          {workshopSteps.map((step, i) => (
            <div key={step.title} className="col-start-1" style={{ gridRow: i + 2 }}>
              <FlowNode {...step} accent="blue" />
            </div>
          ))}

          <div className="col-start-2 row-span-3 row-start-2 self-stretch">
            <HubNode
              title={t('landing.workflow.hubTitle')}
              body={t('landing.workflow.hubBody')}
              workshopTag={t('landing.workflow.hubWorkshopTag')}
              ownerTag={t('landing.workflow.hubOwnerTag')}
            />
          </div>

          {ownerSteps.map((step, i) => (
            <div key={step.title} className="col-start-3" style={{ gridRow: i + 2 }}>
              <FlowNode {...step} accent="emerald" />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile diagram */}
      <div className="space-y-8 lg:hidden">
        <div>
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-300">
            <Building2 className="h-4 w-4" />
            {t('landing.workflow.workshopLabel')}
          </p>
          <div className="space-y-3">
            {workshopSteps.map((step) => (
              <FlowNode key={step.title} {...step} accent="blue" />
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-2 text-violet-300">
            <div className="h-10 w-px bg-gradient-to-b from-blue-400/50 to-violet-400/50" />
            <div className="rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-xs font-medium">
              {t('landing.workflow.hubTitle')}
            </div>
            <div className="h-10 w-px bg-gradient-to-b from-violet-400/50 to-emerald-400/50" />
          </div>
        </div>

        <div>
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <Car className="h-4 w-4" />
            {t('landing.workflow.ownerLabel')}
          </p>
          <div className="space-y-3">
            {ownerSteps.map((step) => (
              <FlowNode key={step.title} {...step} accent="emerald" />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -120; }
        }
      `}</style>
    </section>
  )
}
