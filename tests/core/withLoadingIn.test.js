import { describe, it, expect, beforeEach, vi } from 'vitest'
import Vue from 'vue'

// KompoHelper.js references a global Vue at module-load time (creates a
// reactive store with `new Vue({...})`). Ensure it's available before import.
globalThis.Vue = Vue

const { applyLoadingPanel, dispatchWithLoading } = await import('../../js/core/KompoHelper.js')

describe('applyLoadingPanel helper', () => {
    let panel

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel-x"></div>'
        panel = document.getElementById('panel-x')
    })

    it('adds .vlPanelLoading class when on=true', () => {
        applyLoadingPanel('panel-x', true)
        expect(panel.classList.contains('vlPanelLoading')).toBe(true)
    })

    it('removes .vlPanelLoading class when on=false', () => {
        panel.classList.add('vlPanelLoading')
        applyLoadingPanel('panel-x', false)
        expect(panel.classList.contains('vlPanelLoading')).toBe(false)
    })

    it('is a no-op when the panel is missing', () => {
        expect(() => applyLoadingPanel('nonexistent', true)).not.toThrow()
    })

    it('is a no-op when panelId is falsy', () => {
        expect(() => applyLoadingPanel(null, true)).not.toThrow()
        expect(() => applyLoadingPanel('', true)).not.toThrow()
        expect(() => applyLoadingPanel(undefined, true)).not.toThrow()
    })
})

describe('dispatchWithLoading — wraps an axios call with loading toggle', () => {
    let panel

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel-x"></div>'
        panel = document.getElementById('panel-x')
    })

    it('adds and removes .vlPanelLoading around a successful axios call', async () => {
        const axiosFn = vi.fn(async () => {
            // Inside the request: class should be present
            expect(panel.classList.contains('vlPanelLoading')).toBe(true)
            return { data: { ok: true } }
        })

        const result = await dispatchWithLoading('panel-x', axiosFn, { url: '/_kompo' })

        expect(axiosFn).toHaveBeenCalledOnce()
        expect(axiosFn).toHaveBeenCalledWith({ url: '/_kompo' })
        expect(result).toEqual({ data: { ok: true } })
        // After the request: class should be gone
        expect(panel.classList.contains('vlPanelLoading')).toBe(false)
    })

    it('removes the class even when axios rejects', async () => {
        const axiosFn = vi.fn(async () => {
            expect(panel.classList.contains('vlPanelLoading')).toBe(true)
            throw new Error('boom')
        })

        await expect(dispatchWithLoading('panel-x', axiosFn, {})).rejects.toThrow('boom')
        expect(panel.classList.contains('vlPanelLoading')).toBe(false)
    })

    it('passes through axios result without touching DOM when panelId is falsy', async () => {
        const axiosFn = vi.fn(async () => ({ data: 'noop' }))
        const result = await dispatchWithLoading(null, axiosFn, {})
        expect(result).toEqual({ data: 'noop' })
        expect(panel.classList.contains('vlPanelLoading')).toBe(false)
    })
})

// Action.js -> KompoAxios -> Alert/Vuelidate are heavy; they expect Vue and a
// few globals to exist when modules are evaluated. Stub before importing.
const { default: Action } = await import('../../js/core/Action.js')

describe('withLoadingIn — PHP-driven Action path', () => {
    let panel

    beforeEach(() => {
        document.body.innerHTML = '<div id="php-panel"></div>'
        panel = document.getElementById('php-panel')
    })

    function makeFakeVue() {
        return {
            $_state: vi.fn(),
            $_runInteractionsOfType: vi.fn(),
            $_hasInteractionsOfType: vi.fn(() => false),
            $_config: vi.fn(() => null),
            kompoid: 'k1',
            $_elKompoId: 'k1',
            $kompo: { vlToggleSubmit: vi.fn() },
        }
    }

    it('adds .vlPanelLoading on dispatch and removes on success', async () => {
        const fakeVue = makeFakeVue()
        const action = new Action({
            actionType: 'axiosRequest',
            config: { loadingPanel: 'php-panel' },
            interactions: [],
        }, fakeVue)

        // Stub the axios layer the action calls into.
        action.$_kAxios = {
            $_actionAxiosRequest: () => Promise.resolve({ data: {} }),
        }
        action.getParentKomponentFormData = () => ({})
        action.getParentKomponentInfo = () => ({ data: {} })
        action.handleDynamicResponse = () => false

        action.axiosRequestAction(null, null, {})
        // Synchronously after dispatch (promise still pending), class should be present
        expect(panel.classList.contains('vlPanelLoading')).toBe(true)

        // After microtask drain, class should be cleared
        await new Promise(r => setTimeout(r, 0))
        expect(panel.classList.contains('vlPanelLoading')).toBe(false)
    })

    it('removes .vlPanelLoading even when the request rejects', async () => {
        const fakeVue = makeFakeVue()
        const action = new Action({
            actionType: 'axiosRequest',
            config: { loadingPanel: 'php-panel' },
            interactions: [],
        }, fakeVue)

        action.$_kAxios = {
            $_actionAxiosRequest: () => Promise.reject(new Error('boom')),
        }
        action.getParentKomponentFormData = () => ({})
        action.getParentKomponentInfo = () => ({ data: {} })
        action.handleErrorInteraction = vi.fn()

        action.axiosRequestAction(null, null, {})
        expect(panel.classList.contains('vlPanelLoading')).toBe(true)

        await new Promise(r => setTimeout(r, 0))
        expect(panel.classList.contains('vlPanelLoading')).toBe(false)
    })
})

describe('optimistic — PHP-driven Action path', () => {
    function makeFakeVue(extra = {}) {
        return {
            $_state: vi.fn(),
            $_runInteractionsOfType: vi.fn(),
            $_runAction: vi.fn(),
            kompoid: 'k1',
            $kompo: { vlToggleSubmit: vi.fn() },
            $_config: vi.fn(() => null),
            $_elKompoId: 'k1',
            ...extra,
        }
    }

    function makeAction(config, fakeVue) {
        const action = new Action({
            actionType: 'axiosRequest',
            config,
            interactions: [],
        }, fakeVue)
        action.getParentKomponentFormData = () => ({})
        action.getParentKomponentInfo = () => ({ data: {} })
        action.handleDynamicResponse = () => false
        action.handleErrorInteraction = vi.fn()
        return action
    }

    it('runs success interactions BEFORE the AJAX when optimistic=true', async () => {
        const fakeVue = makeFakeVue()
        const action = makeAction({ optimistic: true }, fakeVue)
        action.$_kAxios = {
            $_actionAxiosRequest: () => Promise.resolve({ data: {} }),
        }

        action.axiosRequestAction(null, null, {})

        // Synchronously after dispatch (promise still pending), success
        // interactions should already have fired with null response.
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledWith(action, 'success', null)
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledTimes(1)
    })

    it('does NOT re-run success interactions on AJAX success when optimistic=true', async () => {
        const fakeVue = makeFakeVue()
        const action = makeAction({ optimistic: true }, fakeVue)
        action.$_kAxios = {
            $_actionAxiosRequest: () => Promise.resolve({ data: {} }),
        }

        action.axiosRequestAction(null, null, {})
        await new Promise(r => setTimeout(r, 0))

        // Still exactly 1 call — pre-AJAX, none after.
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledTimes(1)
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledWith(action, 'success', null)
    })

    it('does NOT run success interactions pre-AJAX when optimistic is falsy', async () => {
        const fakeVue = makeFakeVue()
        const action = makeAction({}, fakeVue) // no optimistic flag
        action.$_kAxios = {
            $_actionAxiosRequest: () => Promise.resolve({ data: { ok: true } }),
        }

        action.axiosRequestAction(null, null, {})

        // Pre-AJAX: no calls yet.
        expect(fakeVue.$_runInteractionsOfType).not.toHaveBeenCalled()

        // After AJAX resolves: success interactions fire with the response.
        await new Promise(r => setTimeout(r, 0))
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledTimes(1)
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledWith(
            action, 'success', { data: { ok: true } }
        )
    })

    it('on AJAX error with optimistic=true, calls handleErrorInteraction (user-defined rollback)', async () => {
        const fakeVue = makeFakeVue()
        const action = makeAction({ optimistic: true }, fakeVue)
        action.$_kAxios = {
            $_actionAxiosRequest: () => Promise.reject(new Error('boom')),
        }

        action.axiosRequestAction(null, null, {})

        // Pre-AJAX: success interactions fire optimistically.
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledWith(action, 'success', null)

        await new Promise(r => setTimeout(r, 0))

        // On error: success interactions did NOT fire a second time.
        // User's error chain (handled via handleErrorInteraction) fires.
        expect(fakeVue.$_runInteractionsOfType).toHaveBeenCalledTimes(1)
        expect(action.handleErrorInteraction).toHaveBeenCalled()
    })
})
