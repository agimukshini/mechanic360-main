import { Car } from 'lucide-react'
import { resolveMediaUrl } from '@/lib/utils'

type VehiclePhotoProps = {
  src?: string | null
  alt: string
  variant?: 'hero' | 'card' | 'thumb' | 'grid' | 'list'
  className?: string
}

const variantStyles = {
  hero: {
    wrap: 'w-14 h-14 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center',
    img: 'max-w-full max-h-full w-auto h-auto object-contain',
  },
  card: {
    wrap: 'w-full aspect-[16/10] min-h-[220px] max-h-[480px] bg-gray-100 flex items-center justify-center p-3',
    img: 'max-w-full max-h-full w-auto h-auto object-contain',
  },
  thumb: {
    wrap: 'w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center',
    img: 'max-w-full max-h-full w-auto h-auto object-contain',
  },
  grid: {
    wrap: 'h-40 bg-gray-100 flex items-center justify-center p-2',
    img: 'max-w-full max-h-full w-auto h-auto object-contain',
  },
  list: {
    wrap: 'w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center p-1 shrink-0',
    img: 'max-w-full max-h-full w-auto h-auto object-contain',
  },
} as const

export default function VehiclePhoto({ src, alt, variant = 'card', className = '' }: VehiclePhotoProps) {
  const styles = variantStyles[variant]
  const url = src ? resolveMediaUrl(src) : null

  if (!url) {
    if (variant === 'grid' || variant === 'card') return null
    return (
      <div className={`${styles.wrap} ${className}`}>
        <Car className="w-6 h-6 text-gray-400" />
      </div>
    )
  }

  return (
    <div className={`${styles.wrap} ${className}`}>
      <img src={url} alt={alt} className={styles.img} loading="lazy" />
    </div>
  )
}

