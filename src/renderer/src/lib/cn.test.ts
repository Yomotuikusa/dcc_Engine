import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('tailwind class merge works', () => {
    expect(cn('p-2', 'p-4', 'text-sm')).toBe('p-4 text-sm')
  })
})
