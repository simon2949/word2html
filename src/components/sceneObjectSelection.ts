import type { KeyboardEvent, MouseEvent } from 'react'

export function sceneObjectSelectionProps(
  objectId: string,
  label: string,
  selectedObjectId: string | null | undefined,
  onObjectSelect: ((objectId: string) => void) | undefined,
  baseClassName = '',
) {
  const selected = selectedObjectId === objectId
  return {
    className: [baseClassName, 'scene-editable-object', selected ? 'is-object-selected' : '']
      .filter(Boolean)
      .join(' '),
    'data-scene-object-id': objectId,
    'data-scene-selected': selected ? 'true' : 'false',
    tabIndex: onObjectSelect ? 0 : undefined,
    role: onObjectSelect ? 'button' as const : undefined,
    'aria-label': onObjectSelect ? `选择${label}` : undefined,
    onClick: (event: MouseEvent<SVGElement>) => {
      if (!onObjectSelect) return
      event.stopPropagation()
      onObjectSelect(objectId)
    },
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (!onObjectSelect || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      event.stopPropagation()
      onObjectSelect(objectId)
    },
  }
}
