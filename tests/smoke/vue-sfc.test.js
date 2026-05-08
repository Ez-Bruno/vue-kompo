import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

const Trivial = {
    props: ['msg'],
    template: '<div class="hello">{{ msg }}</div>'
}

describe('vue 2 sfc compilation', () => {
    it('mounts a trivial component and renders props', () => {
        const wrapper = mount(Trivial, {
            propsData: { msg: 'hi' }
        })
        expect(wrapper.find('.hello').text()).toBe('hi')
    })
})
