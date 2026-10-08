import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from './cn'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 border font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'border-moss-600 bg-moss-600 text-parchment-50 hover:bg-moss-500 disabled:hover:bg-moss-600',
        secondary:
          'border-bark-600 bg-bark-800 text-parchment-100 hover:border-bark-500 hover:bg-bark-700',
        ghost:
          'border-transparent bg-transparent text-parchment-300 hover:bg-bark-800 hover:text-parchment-50',
        outline: 'border-bark-600 bg-transparent text-parchment-200 hover:bg-bark-800',
        danger: 'border-danger-600 bg-danger-600 text-parchment-50 hover:bg-danger-500',
      },
      size: {
        sm: 'h-6 px-2 text-[11px]',
        md: 'h-8 px-3 text-xs',
        lg: 'h-10 px-4 text-sm',
        icon: 'size-7 p-0',
        iconSm: 'size-6 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export default function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
