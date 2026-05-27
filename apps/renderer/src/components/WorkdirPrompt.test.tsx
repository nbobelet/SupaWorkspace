// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkdirPrompt } from './WorkdirPrompt'

// Regression for: right-click workspace -> "Set workdir" did nothing because
// editWorkdir called window.prompt, which is a no-op in the Electron renderer.
// The fix replaces it with this real DOM dialog. These tests pin the contract
// the prompt could never satisfy: an in-DOM input that commits a value.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount(node: ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { root, container }
}

function getInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Working directory path"]',
  )
  if (!input)
    throw new Error('workdir input not in DOM — the prompt did not render an editable field')
  return input
}

function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('WorkdirPrompt — real DOM dialog replacing window.prompt', () => {
  it('renders an editable input pre-filled with the current workdir', () => {
    mount(
      <WorkdirPrompt
        workspaceName="Home"
        initialValue="/home/nico/proj"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(getInput().value).toBe('/home/nico/proj')
  })

  it('Save commits the trimmed value via onSubmit', () => {
    const onSubmit = vi.fn()
    mount(
      <WorkdirPrompt workspaceName="Home" initialValue="" onSubmit={onSubmit} onClose={vi.fn()} />,
    )
    setValue(getInput(), '  /home/nico/app  ')
    const save = document.querySelector<HTMLButtonElement>('button[data-action="save-workdir"]')
    click(save as Element)
    expect(onSubmit).toHaveBeenCalledWith('/home/nico/app')
  })

  it('a blank value clears the workdir (onSubmit null)', () => {
    const onSubmit = vi.fn()
    mount(
      <WorkdirPrompt
        workspaceName="Home"
        initialValue="/old/path"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )
    setValue(getInput(), '   ')
    const save = document.querySelector<HTMLButtonElement>('button[data-action="save-workdir"]')
    click(save as Element)
    expect(onSubmit).toHaveBeenCalledWith(null)
  })

  it('Enter in the input commits, Escape closes without submitting', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    mount(
      <WorkdirPrompt
        workspaceName="Home"
        initialValue="/x"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    )
    const input = getInput()
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onSubmit).toHaveBeenCalledWith('/x')

    onSubmit.mockClear()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
