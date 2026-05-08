import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Vue from 'vue'
import { replaceElementById } from '../../js/form/helpers/replaceElementById'

// The Query portion we actually care about: listen to vlUpdateElements, walk
// filters + headers + each card.render (and nested .elements), patch in place.
// This stand-in is a narrow facsimile; the source-contract test below ensures
// the real Query.vue carries the same implementation shape.
const makeQueryStandIn = (kompoid) => ({
    props: ['initial'],
    data() {
        return {
            filters: this.initial.filters || { top: [], left: [], bottom: [], right: [] },
            headers: this.initial.headers || [],
            cards: this.initial.cards || [],
            filtersPlacement: ['top', 'left', 'bottom', 'right'],
        }
    },
    template: `
        <div>
            <div v-for="p in filtersPlacement" :key="p">
                <div v-for="(f, i) in filters[p]" :key="f.id || f._kid || p + '__idx-' + i" :data-filter-id="f.id || f._kid">{{ f.label }}</div>
            </div>
            <div v-for="(h, i) in headers" :key="h.id || h._kid || 'h__idx-' + i" :data-header-id="h.id || h._kid">{{ h.label }}</div>
            <div v-for="(card, i) in cards" :key="card.attributes.id || '__card-' + i" :data-card-id="card.attributes.id">
                <span :data-render-id="card.render._kid || card.render.id">{{ card.render.label }}</span>
            </div>
        </div>
    `,
    created() {
        this.$root.$on('vlUpdateElements' + kompoid, (updates, transition) => {
            this.$_updateElementsInQuery(updates, transition)
        })
    },
    methods: {
        $_updateElementsInQuery(updates, transition) {
            const setter = (arr, i, v) => this.$set(arr, i, v)
            Object.keys(updates).forEach(id => {
                const newElement = updates[id]
                if (transition && newElement.config) {
                    newElement.config.transition = transition
                }

                for (const placement of this.filtersPlacement) {
                    if (replaceElementById(this.filters[placement], id, newElement, setter)) return
                }
                if (replaceElementById(this.headers, id, newElement, setter)) return

                for (let i = 0; i < this.cards.length; i++) {
                    const card = this.cards[i]
                    if (!card || !card.render) continue
                    if (card.render.id === id || card.render._kid === id) {
                        this.$set(card, 'render', newElement)
                        return
                    }
                    if (Array.isArray(card.render.elements)) {
                        if (replaceElementById(card.render.elements, id, newElement, setter)) return
                    }
                }
            })
        }
    }
})

describe('Query vlUpdateElements listener (stand-in)', () => {
    it('patches an element nested inside a card.render by id', async () => {
        const QueryStandIn = makeQueryStandIn('q1')
        const cellOld = { vueComponent: 'Html', id: 'cell-1', _kid: 'k-cell-1', label: 'Old', elements: [] }
        const card = { attributes: { id: 'c1' }, render: cellOld }

        const wrapper = mount(QueryStandIn, { propsData: { initial: { cards: [card] } } })

        wrapper.vm.$root.$emit('vlUpdateElementsq1', {
            'cell-1': { vueComponent: 'Html', id: 'cell-1', _kid: 'k-cell-1', label: 'New', elements: [] }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-render-id="k-cell-1"]').text()).toBe('New')
    })

    it('patches a filter element by id', async () => {
        const QueryStandIn = makeQueryStandIn('q2')
        const filter = { vueComponent: 'Input', id: 'filter-1', _kid: 'k-filter-1', label: 'Old' }

        const wrapper = mount(QueryStandIn, {
            propsData: {
                initial: { filters: { top: [filter], left: [], bottom: [], right: [] }, cards: [], headers: [] }
            }
        })

        wrapper.vm.$root.$emit('vlUpdateElementsq2', {
            'filter-1': { vueComponent: 'Input', id: 'filter-1', _kid: 'k-filter-1', label: 'New' }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-filter-id="filter-1"]').text()).toBe('New')
    })

    it('patches a header by _kid when id is absent', async () => {
        const QueryStandIn = makeQueryStandIn('q3')
        const header = { vueComponent: 'Th', id: null, _kid: 'k-hdr', label: 'Old' }

        const wrapper = mount(QueryStandIn, {
            propsData: { initial: { headers: [header], cards: [], filters: { top: [], left: [], bottom: [], right: [] } } }
        })

        wrapper.vm.$root.$emit('vlUpdateElementsq3', {
            'k-hdr': { vueComponent: 'Th', id: null, _kid: 'k-hdr', label: 'New' }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-header-id="k-hdr"]').text()).toBe('New')
    })

    it('patches the card.render when the render itself matches (not nested)', async () => {
        const QueryStandIn = makeQueryStandIn('q4')
        const card = { attributes: { id: 'c1' }, render: { vueComponent: 'Html', id: 'render-1', _kid: 'k-render-1', label: 'Old', elements: [] } }

        const wrapper = mount(QueryStandIn, { propsData: { initial: { cards: [card] } } })

        wrapper.vm.$root.$emit('vlUpdateElementsq4', {
            'render-1': { vueComponent: 'Html', id: 'render-1', _kid: 'k-render-1', label: 'New', elements: [] }
        })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-render-id="k-render-1"]').text()).toBe('New')
    })

    it('no-ops silently when no match in any region', async () => {
        const QueryStandIn = makeQueryStandIn('q5')
        const wrapper = mount(QueryStandIn, { propsData: { initial: {} } })

        // Should not throw
        wrapper.vm.$root.$emit('vlUpdateElementsq5', { 'nope': { label: 'x' } })

        await wrapper.vm.$nextTick()
        expect(wrapper.vm.cards).toEqual([])
    })
})

describe('Query.vue implementation contract', () => {
    it('registers vlUpdateElements listener and uses the shared helper', () => {
        const fs = require('fs')
        const path = require('path')
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../js/query/Query.vue'),
            'utf8'
        )
        expect(source).toMatch(/vlUpdateElements['"]\s*\+\s*this\.\$_elKompoId/)
        expect(source).toMatch(/import \{ replaceElementById \} from ['"]\.\.[\/\\]form[\/\\]helpers[\/\\]replaceElementById['"]/)
        // The listener teardown — match the method definition (not a .$_destroyEvents() call)
        const destroyBlock = source.match(/\$_destroyEvents\s*\(\s*\)\s*\{[\s\S]*?\]/)
        expect(destroyBlock, 'Expected $_destroyEvents block').toBeTruthy()
        expect(destroyBlock[0]).toMatch(/vlUpdateElements/)
    })
})

describe('Query vlUpdateElements does not interfere with existing flows', () => {
    it('different event (vlUpdateItem) is untouched by new listener', async () => {
        const QueryStandIn = makeQueryStandIn('q6')
        const card = { attributes: { id: 'c1' }, render: { vueComponent: 'Html', id: 'x', _kid: 'k-x', label: 'Old', elements: [] } }

        const wrapper = mount(QueryStandIn, { propsData: { initial: { cards: [card] } } })

        // We only emit vlUpdateItem — it should NOT affect anything because the stand-in
        // doesn't listen for it. The render label stays 'Old'.
        wrapper.vm.$root.$emit('vlUpdateItemq6', 'c1', { something: 'else' })

        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-render-id="k-x"]').text()).toBe('Old')
    })
})
