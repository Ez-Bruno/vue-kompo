import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { replaceElementById } from '../../js/form/helpers/replaceElementById'

describe('replaceElementById (pure)', () => {
    const makeSetter = () => {
        const calls = []
        const setter = (arr, i, v) => { calls.push([arr, i, v]); arr[i] = v }
        return { setter, calls }
    }

    it('returns false and does not call setter when elements is not an array', () => {
        const { setter, calls } = makeSetter()
        expect(replaceElementById(null, 'x', {}, setter)).toBe(false)
        expect(replaceElementById(undefined, 'x', {}, setter)).toBe(false)
        expect(replaceElementById({}, 'x', {}, setter)).toBe(false)
        expect(calls).toHaveLength(0)
    })

    it('matches by id at depth 0', () => {
        const a = { id: 'a' }
        const elements = [a]
        const { setter, calls } = makeSetter()
        const replacement = { id: 'a', label: 'new' }

        expect(replaceElementById(elements, 'a', replacement, setter)).toBe(true)
        expect(calls).toHaveLength(1)
        expect(calls[0][0]).toBe(elements)
        expect(calls[0][1]).toBe(0)
        expect(calls[0][2]).toBe(replacement)
    })

    it('matches by _kid when id is absent', () => {
        const a = { _kid: 'k-a' }
        const elements = [a]
        const { setter } = makeSetter()
        expect(replaceElementById(elements, 'k-a', { _kid: 'k-a' }, setter)).toBe(true)
    })

    it('recurses into nested elements', () => {
        const leaf = { id: 'leaf' }
        const row  = { id: 'row', elements: [leaf] }
        const elements = [row]
        const { setter, calls } = makeSetter()

        expect(replaceElementById(elements, 'leaf', { id: 'leaf', label: 'new' }, setter)).toBe(true)
        expect(calls[0][0]).toBe(row.elements)
        expect(calls[0][1]).toBe(0)
    })

    it('skips null/undefined children gracefully', () => {
        const a = { id: 'a' }
        const elements = [null, undefined, a]
        const { setter } = makeSetter()
        expect(replaceElementById(elements, 'a', { id: 'a' }, setter)).toBe(true)
    })

    it('returns false when no match found', () => {
        const elements = [{ id: 'a' }, { id: 'b', elements: [{ id: 'c' }] }]
        const { setter, calls } = makeSetter()
        expect(replaceElementById(elements, 'z', {}, setter)).toBe(false)
        expect(calls).toHaveLength(0)
    })

    it('first match wins — does not continue after a match', () => {
        const elements = [{ id: 'a' }, { id: 'a' }]
        const { setter, calls } = makeSetter()
        replaceElementById(elements, 'a', { id: 'a', label: 'new' }, setter)
        expect(calls).toHaveLength(1)
        expect(calls[0][1]).toBe(0)
    })
})

// Reuse the stand-in pattern established in FormInner.key.test.js, but
// equip it with the real $_updateElementsById algorithm we want to ship.
// We can't mount FormInner.vue directly (KompoHelper.js module-load issue).

// This stand-in mirrors the desired recursive behaviour. It delegates to the
// shared pure helper so it stays in sync with FormInner.vue.
const RecursiveUpdater = {
    props: ['elements'],
    data() { return { localElements: this.elements } },
    watch: {
        elements(newVal) { this.localElements = newVal }
    },
    components: {
        VlStubElement: {
            name: 'VlStubElement',
            props: ['vkompo'],
            template: '<div :data-id="vkompo.id" :data-kid="vkompo._kid">{{ vkompo.label }}<template v-if="vkompo.elements"><vl-stub-element v-for="(c, i) in vkompo.elements" :vkompo="c" :key="c.id || c._kid || \'__idx-\' + i" /></template></div>'
        }
    },
    template: `
        <div>
            <template v-for="(component, index) in localElements">
                <component
                    :is="'Vl' + component.vueComponent"
                    :key="component.id || component._kid || '__idx-' + index"
                    :vkompo="component"
                />
            </template>
        </div>
    `,
    methods: {
        $_updateElementsById(updates, transition) {
            const setter = (arr, i, v) => this.$set(arr, i, v)
            Object.keys(updates).forEach(id => {
                const newElement = updates[id]
                if (transition && newElement.config) {
                    newElement.config.transition = transition
                }
                replaceElementById(this.localElements, id, newElement, setter)
            })
        }
    }
}

describe('$_updateElementsById recursive', () => {
    it('patches a top-level element by id', async () => {
        const leaf = { vueComponent: 'StubElement', id: 'leaf-1', _kid: 'k-leaf-1', label: 'Old', elements: [] }
        const wrapper = mount(RecursiveUpdater, { propsData: { elements: [leaf] } })

        wrapper.vm.$_updateElementsById({
            'leaf-1': { vueComponent: 'StubElement', id: 'leaf-1', _kid: 'k-leaf-1', label: 'New', elements: [] }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-id="leaf-1"]').text()).toContain('New')
    })

    it('patches a nested element by id without touching siblings', async () => {
        const leaf = { vueComponent: 'StubElement', id: 'leaf-1', _kid: 'k-leaf-1', label: 'Old', elements: [] }
        const row  = { vueComponent: 'StubElement', id: 'row-1',  _kid: 'k-row-1',  label: 'Row',  elements: [leaf] }
        const sibling = { vueComponent: 'StubElement', id: 'sib', _kid: 'k-sib', label: 'Sib', elements: [] }

        const wrapper = mount(RecursiveUpdater, { propsData: { elements: [row, sibling] } })

        const sibBefore = wrapper.findAll('[data-kid="k-sib"]').wrappers[0].element

        wrapper.vm.$_updateElementsById({
            'leaf-1': { vueComponent: 'StubElement', id: 'leaf-1', _kid: 'k-leaf-1', label: 'New', elements: [] }
        })

        await wrapper.vm.$nextTick()

        expect(wrapper.find('[data-id="leaf-1"]').text()).toContain('New')
        const sibAfter = wrapper.findAll('[data-kid="k-sib"]').wrappers[0].element
        expect(sibAfter).toBe(sibBefore)
    })

    it('matches by _kid when explicit id is absent', async () => {
        const leaf = { vueComponent: 'StubElement', id: null, _kid: 'k-deep', label: 'Old', elements: [] }
        const wrapper = mount(RecursiveUpdater, { propsData: { elements: [leaf] } })

        wrapper.vm.$_updateElementsById({
            'k-deep': { vueComponent: 'StubElement', id: null, _kid: 'k-deep', label: 'New', elements: [] }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-kid="k-deep"]').text()).toContain('New')
    })

    it('no-ops silently when id matches nothing', async () => {
        const leaf = { vueComponent: 'StubElement', id: 'leaf-1', _kid: 'k-leaf-1', label: 'Old', elements: [] }
        const wrapper = mount(RecursiveUpdater, { propsData: { elements: [leaf] } })

        // No throw, leaf unchanged
        wrapper.vm.$_updateElementsById({
            'nonexistent': { label: 'Never' }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-id="leaf-1"]').text()).toContain('Old')
    })
})

describe('FormInner.vue implementation contract', () => {
    it('imports and uses the shared replaceElementById helper', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../js/form/FormInner.vue'),
            'utf8'
        )
        expect(source).toMatch(/import \{ replaceElementById \} from ['"]\.\/helpers\/replaceElementById['"]/)
        expect(source).toMatch(/replaceElementById\s*\(/)
    })
})
