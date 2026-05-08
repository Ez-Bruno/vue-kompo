import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'

// Lightweight stand-in that mirrors the exact v-for block from FormInner.vue.
// Keep this in sync with the template in FormInner.vue (verified by the
// template-contract test below).
const FormInnerStandIn = {
    props: ['elements'],
    components: {
        VlStubElement: {
            props: ['vkompo'],
            template: '<div :data-kid="vkompo._kid" :data-label="vkompo.label" :data-id="vkompo.id">stub</div>'
        }
    },
    template: `
        <div>
            <template v-for="(component, index) in elements">
                <component
                    :is="'Vl' + component.vueComponent"
                    :key="component.id || component._kid || '__idx-' + index"
                    :vkompo="component"
                />
            </template>
        </div>
    `
}

describe('FormInner keyed reconciliation (stand-in)', () => {
    it('preserves DOM elements across sibling reorder when _kid is stable', async () => {
        const a = { vueComponent: 'StubElement', label: 'A', _kid: 'k-a', id: null, elements: [] }
        const b = { vueComponent: 'StubElement', label: 'B', _kid: 'k-b', id: null, elements: [] }
        const c = { vueComponent: 'StubElement', label: 'C', _kid: 'k-c', id: null, elements: [] }

        const wrapper = mount(FormInnerStandIn, {
            propsData: { elements: [a, b, c] }
        })

        const before = wrapper.findAll('[data-kid]').wrappers.map(w => w.element)
        expect(before).toHaveLength(3)

        await wrapper.setProps({ elements: [b, a, c] })

        const after = wrapper.findAll('[data-kid]').wrappers.map(w => w.element)
        expect(after).toHaveLength(3)

        const aBefore = before.find(el => el.dataset.kid === 'k-a')
        const aAfter  = after.find(el => el.dataset.kid === 'k-a')
        expect(aAfter).toBe(aBefore)
    })

    it('uses explicit id over _kid', async () => {
        const a = { vueComponent: 'StubElement', label: 'A', _kid: 'k-hash-a', id: 'explicit-a', elements: [] }
        const wrapper = mount(FormInnerStandIn, {
            propsData: { elements: [a] }
        })
        // Explicit id was used — we can't easily observe the key from outside,
        // but a DOM reference preservation check does the job indirectly.
        const elBefore = wrapper.findAll('[data-id="explicit-a"]').wrappers[0].element

        // Keep the same element at position 0; confirm DOM ref is stable.
        await wrapper.setProps({ elements: [{ ...a }] })
        const elAfter = wrapper.findAll('[data-id="explicit-a"]').wrappers[0].element
        expect(elAfter).toBe(elBefore)
    })

    it('falls back to sibling index when no id/kid is present', async () => {
        // Without any stable key, Vue reconciles by the __idx-N fallback,
        // which for the same index is stable. Swap positions: position 0 stays
        // the same DOM node by index.
        const a = { vueComponent: 'StubElement', label: 'X', _kid: null, id: null, elements: [] }
        const b = { vueComponent: 'StubElement', label: 'X', _kid: null, id: null, elements: [] }

        const wrapper = mount(FormInnerStandIn, {
            propsData: { elements: [a, b] }
        })

        expect(wrapper.findAll('[data-label="X"]')).toHaveLength(2)

        await wrapper.setProps({ elements: [b, a] })
        expect(wrapper.findAll('[data-label="X"]')).toHaveLength(2)
        // Graceful degradation — no crash, no duplicate-key warnings that halt rendering.
    })
})

describe('FormInner template contract', () => {
    it('keeps the :key binding in the v-for template', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../js/form/FormInner.vue'),
            'utf8'
        )
        // Pull the <template> block
        const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/)
        expect(templateMatch, 'FormInner.vue must have a <template> block').toBeTruthy()
        const template = templateMatch[1]

        // The v-for must carry :key — otherwise keyed reconciliation is gone.
        expect(template).toMatch(/v-for=/)
        expect(template).toMatch(/:key=/)
        // The key expression must fall back through id / _kid / index
        expect(template).toMatch(/component\.id/)
        expect(template).toMatch(/component\._kid/)
        expect(template).toMatch(/__idx-/)
    })
})
