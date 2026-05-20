// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isOutsidePopup } from './dismiss'

describe('isOutsidePopup', () => {
  // Regression: right-clicking a column → "Add task" opens an inline composer.
  // Typing a title longer than the input width makes the input scroll its text
  // horizontally, which fires a `scroll` event. The window-level dismiss
  // listener used to close the composer on ANY scroll, so a long title
  // auto-closed the input. A scroll originating INSIDE the popup must not
  // dismiss it.
  it('keeps the popup open for a scroll fired by its own input', () => {
    const popup = document.createElement('div')
    const input = document.createElement('input')
    popup.appendChild(input)
    document.body.appendChild(popup)

    const scroll = new Event('scroll', { bubbles: false })
    Object.defineProperty(scroll, 'target', { value: input })

    expect(isOutsidePopup(popup, scroll.target)).toBe(false)
  })

  it('dismisses for an event fired outside the popup', () => {
    const popup = document.createElement('div')
    const elsewhere = document.createElement('div')
    document.body.append(popup, elsewhere)

    expect(isOutsidePopup(popup, elsewhere)).toBe(true)
  })

  it('does not dismiss when the popup is not mounted', () => {
    expect(isOutsidePopup(null, document.body)).toBe(false)
  })
})
