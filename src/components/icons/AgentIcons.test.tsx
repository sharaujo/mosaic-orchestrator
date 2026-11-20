import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ALL_AGENT_TYPES } from '../../lib/types'
import { AgentIcon, VSCodeIcon } from './AgentIcons'

describe('neutral agent and editor icons', () => {
  it.each(ALL_AGENT_TYPES)('renders %s at toolbar sizes in both theme families', (type) => {
    for (const theme of ['dark', 'light'] as const) {
      for (const size of [12, 16, 24]) {
        const { container, unmount } = render(<AgentIcon type={type} size={size} theme={theme} />)
        const svg = container.querySelector('svg')!
        expect(svg).not.toBeNull()
        expect(svg).toHaveAttribute('width', String(size))
        expect(svg).toHaveAttribute('height', String(size))
        expect(svg.querySelector('path, rect, circle, line, polyline')).not.toBeNull()
        expect(svg).toHaveAttribute('stroke', 'currentColor')
        expect(container.querySelector('img, image, use')).toBeNull()
        unmount()
      }
    }
  })

  it('keeps the editor action and unknown provider fallback drawable without image requests', () => {
    const { container } = render(
      <>
        <VSCodeIcon size={12} />
        <AgentIcon type="unregistered-provider" theme="dark" />
      </>,
    )
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(container.querySelector('img')).toBeNull()
  })
})
