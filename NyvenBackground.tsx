import clsx from 'clsx'

interface NyvenBackgroundProps {
  className?: string
  particles?: boolean
}

export function NyvenBackground({ className, particles = true }: NyvenBackgroundProps) {
  return (
    <div
      className={clsx(
        'fixed inset-0 -z-10 nyven-bg overflow-hidden',
        particles && 'nyven-particles',
        className
      )}
      aria-hidden="true"
    />
  )
}
