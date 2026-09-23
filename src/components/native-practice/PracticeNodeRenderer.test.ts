import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PracticeNodeRenderer from './PracticeNodeRenderer.vue'
import { createEmptyDraftState } from '@/utils/readingPractice'
import type { PracticeHighlightRecord, ReadingAstNode } from '@/types/readingNative'

function mountRenderer(nodes: ReadingAstNode[], options: {
  namespace?: string
  examStyle?: boolean
  selectedOptionKey?: string
  highlights?: PracticeHighlightRecord[]
  questionDisplayMap?: Record<string, string>
} = {}) {
  return mount(PracticeNodeRenderer, {
    global: { provide: { 'practice-dom-prefix': ref(options.namespace || '') } },
    props: {
      nodes,
      scope: 'questions',
      draftState: createEmptyDraftState(),
      submitted: false,
      readOnly: false,
      selectedOptionKey: options.selectedOptionKey || '',
      highlights: options.highlights || [],
      usedOptionValues: {},
      examStyle: options.examStyle,
      questionDisplayMap: options.questionDisplayMap
    }
  })
}

describe('PracticeNodeRenderer exam style', () => {
  it('renders only conservatively matched choice questions as native details', async () => {
    const question: ReadingAstNode = {
      type: 'element',
      tag: 'div',
      attrs: { class: 'mc-question-item' },
      children: [
        { type: 'element', tag: 'p', attrs: {}, children: [{ type: 'text', text: 'Question one' }] },
        {
          type: 'element',
          tag: 'label',
          attrs: { class: 'mc-option' },
          children: [
            { type: 'choiceInput', inputType: 'radio', fieldName: 'q1', questionId: 'q1', questionIds: ['q1'], value: 'A', attrs: {} },
            { type: 'text', text: ' A first option' }
          ]
        },
        {
          type: 'element',
          tag: 'label',
          attrs: { class: 'mc-option' },
          children: [
            { type: 'choiceInput', inputType: 'radio', fieldName: 'q1', questionId: 'q1', questionIds: ['q1'], value: 'B', attrs: {} },
            { type: 'text', text: ' B second option' }
          ]
        }
      ]
    }
    const highlight: PracticeHighlightRecord = {
      id: 'stem-highlight',
      scope: 'questions',
      text: 'Question',
      startPath: '0.0.0',
      startOffset: 0,
      endPath: '0.0.0',
      endOffset: 8
    }
    const wrapper = mountRenderer([question], { examStyle: true, highlights: [highlight] })

    const details = wrapper.get('details.native-exam-choice')
    expect(details.attributes('open')).toBeUndefined()
    expect(details.get('summary').text()).toBe('Question one')
    expect(details.get('mark').attributes('data-highlight-node-path')).toBe('0.0.0')
    expect(details.findAll('input[type="radio"]')).toHaveLength(2)

    await wrapper.setProps({ submitted: true })
    expect(wrapper.get('details').attributes('open')).toBe('')

    const normalWrapper = mountRenderer([question])
    expect(normalWrapper.find('details').exists()).toBe(false)
    expect(normalWrapper.get('div.mc-question-item').exists()).toBe(true)
  })

  it('passes examStyle recursively and labels text controls by question number', () => {
    const wrapper = mountRenderer([{
      type: 'element',
      tag: 'div',
      attrs: {},
      children: [
        { type: 'textInput', questionId: 'q12', fieldName: 'q12', attrs: {} },
        {
          type: 'textarea',
          questionId: 'q13',
          fieldName: 'q13',
          attrs: { placeholder: 'Existing prompt' }
        }
      ]
    }], { examStyle: true, questionDisplayMap: { q12: '32', q13: '33' } })

    const input = wrapper.get('input.native-text-input')
    expect(input.attributes('placeholder')).toBe('32')
    expect(input.attributes('aria-label')).toBe('Question 32')

    const textarea = wrapper.get('textarea')
    expect(textarea.attributes('placeholder')).toBe('Existing prompt')
    expect(textarea.attributes('aria-label')).toBe('Question 33')
  })

  it('opens an existing highlight by context menu only in exam style', async () => {
    const record: PracticeHighlightRecord = {
      id: 'highlight-1',
      scope: 'questions',
      text: 'answer',
      startPath: '0',
      startOffset: 0,
      endPath: '0',
      endOffset: 6
    }
    const examWrapper = mountRenderer([{ type: 'text', text: 'answer text' }], {
      examStyle: true,
      highlights: [record]
    })
    const examHighlight = examWrapper.get('mark')
    const bubbledContextMenu = vi.fn()
    examHighlight.element.parentElement?.addEventListener('contextmenu', bubbledContextMenu)

    await examHighlight.trigger('click', { clientX: 10, clientY: 20 })
    expect(examWrapper.emitted('open:highlight')).toBeUndefined()
    await examHighlight.trigger('contextmenu', { clientX: 10, clientY: 20 })
    expect(examWrapper.emitted('open:highlight')).toHaveLength(1)
    expect(bubbledContextMenu).not.toHaveBeenCalled()

    const normalWrapper = mountRenderer([{ type: 'text', text: 'answer text' }], {
      highlights: [record]
    })
    await normalWrapper.get('mark').trigger('click', { clientX: 10, clientY: 20 })
    expect(normalWrapper.emitted('open:highlight')).toHaveLength(1)
  })

  it.each(['Enter', ' '])('activates an accessible dropzone with the %j key', async (key) => {
    const wrapper = mountRenderer([
      {
        type: 'dropzone',
        appearance: 'paragraph',
        questionId: 'q7',
        paragraph: 'A',
        labelText: 'Paragraph A',
        attrs: {}
      },
      {
        type: 'element',
        tag: 'p',
        attrs: {},
        children: [{
          type: 'element',
          tag: 'strong',
          attrs: {},
          children: [{ type: 'text', text: 'A' }]
        }, { type: 'text', text: ' Article text' }]
      }
    ], {
      examStyle: true,
      selectedOptionKey: 'headings::iii',
      questionDisplayMap: { q7: '34' }
    })
    const dropzone = wrapper.get('.native-dropzone')

    expect(dropzone.attributes('role')).toBe('button')
    expect(dropzone.attributes('tabindex')).toBe('0')
    expect(dropzone.attributes('aria-label')).toBe('Question 34 answer dropzone')
    expect(dropzone.get('.dropzone-text').text()).toBe('34')
    expect(dropzone.find('.dropzone-prefix').exists()).toBe(false)
    expect(wrapper.get('p strong').text()).toBe('A')

    await dropzone.trigger('keydown', { key })
    expect(wrapper.emitted('set:dropzone')?.[0]).toEqual([{
      questionId: 'q7',
      poolId: 'headings',
      value: 'iii',
      label: 'iii'
    }])
  })
})


describe('suite DOM isolation', () => {
  it('prefixes nested labels and radio groups without changing answer field keys', async () => {
    const nodes: ReadingAstNode[] = [{ type: 'element', tag: 'label', attrs: { for: 'q1-A', id: 'q1-label' }, children: [
      { type: 'choiceInput', inputType: 'radio', fieldName: 'q1', questionId: 'q1', questionIds: ['q1'], value: 'A', attrs: { id: 'q1-A' } }
    ] }]
    const first = mountRenderer(nodes, { namespace: 'suite-part-1-' })
    const second = mountRenderer(nodes, { namespace: 'suite-part-2-' })
    expect(first.get('label').attributes('for')).toBe('suite-part-1-q1-A')
    expect(first.get('input').attributes('id')).toBe('suite-part-1-q1-A')
    expect(first.get('input').attributes('name')).toBe('suite-part-1-q1')
    expect(second.get('input').attributes('name')).toBe('suite-part-2-q1')
    await second.get('input').setValue(true)
    expect(second.emitted('toggle:choice')?.[0]?.[0]).toMatchObject({ fieldName: 'q1', value: 'A' })
    first.unmount()
    second.unmount()
  })
})


describe('matching option drag preview', () => {
  it('preserves the source appearance and pointer grab offset throughout dragging', async () => {
    const originalElementsFromPoint = document.elementsFromPoint
    document.elementsFromPoint = () => []
    const wrapper = mountRenderer([{ type: 'optionChip', poolId: 'people', value: 'A', label: 'A Professor Norman Cook', attrs: {} }])
    const chip = wrapper.get('.native-option-chip')
    const element = chip.element as HTMLElement
    document.body.appendChild(element)
    element.style.cssText = 'background: rgb(223, 230, 245); border-radius: 1px; font: 13px Arial; padding: 5px 16px;'
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200, width: 260, height: 30, right: 360, bottom: 230, x: 100, y: 200, toJSON: () => ({}) })
    await chip.trigger('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 180, clientY: 215 })
    await chip.trigger('pointermove', { pointerId: 1, clientX: 210, clientY: 235 })
    const ghost = document.querySelector<HTMLElement>('.native-option-drag-ghost')!
    expect(ghost.textContent).toBe('A Professor Norman Cook')
    expect(ghost.style.backgroundColor).toBe('rgb(223, 230, 245)')
    expect(ghost.style.borderRadius).toBe('1px')
    expect(ghost.style.width).toBe('260px')
    expect(ghost.style.height).toBe('30px')
    expect(ghost.style.transform).toBe('translate(130px, 220px)')
    await chip.trigger('pointermove', { pointerId: 1, clientX: 300, clientY: 400 })
    expect(ghost.style.transform).toBe('translate(220px, 385px)')
    await chip.trigger('pointercancel', { pointerId: 1 })
    expect(document.querySelector('.native-option-drag-ghost')).toBeNull()
    expect(document.body.classList.contains('native-option-dragging')).toBe(false)
    element.remove()
    document.elementsFromPoint = originalElementsFromPoint
    wrapper.unmount()
  })
})
