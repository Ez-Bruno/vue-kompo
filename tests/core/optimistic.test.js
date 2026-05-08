import { describe, it, expect, vi, beforeEach } from 'vitest'
import Vue from 'vue'

// KompoHelper.js references a global Vue at module-load time (creates a
// reactive store with `new Vue({...})`). Ensure it's available before import.
globalThis.Vue = Vue

const { runSubAction, applyOptimisticChain, OPTIMISTIC_INVERSE } = await import('../../js/core/KompoHelper.js')

describe('OPTIMISTIC_INVERSE table', () => {
    it('maps add/remove class to each other', () => {
        expect(OPTIMISTIC_INVERSE.jsAddClass).toBe('jsRemoveClass')
        expect(OPTIMISTIC_INVERSE.jsRemoveClass).toBe('jsAddClass')
    })
    it('treats toggle and visibility flips as self-inverse / paired', () => {
        expect(OPTIMISTIC_INVERSE.jsToggleClass).toBe('jsToggleClass')
        expect(OPTIMISTIC_INVERSE.jsShow).toBe('jsHide')
        expect(OPTIMISTIC_INVERSE.jsHide).toBe('jsShow')
        expect(OPTIMISTIC_INVERSE.jsToggle).toBe('jsToggle')
    })
    it('does NOT include run (cannot rollback)', () => {
        expect(OPTIMISTIC_INVERSE.run).toBeUndefined()
    })
})

describe('applyOptimisticChain', () => {
    let ctx, applied

    beforeEach(() => {
        applied = []
        // ctx handlers receive (action, response) — same shape as the real
        // _buildSubActionContext handlers in KompoHttpRequest. Stubs read
        // `action.target`, `action.class`, etc.
        ctx = {
            jsAddClass:    (a) => applied.push(['add',    a.target, a.class]),
            jsRemoveClass: (a) => applied.push(['remove', a.target, a.class]),
            jsToggleClass: (a) => applied.push(['toggle', a.target, a.class]),
            jsShow:        (a) => applied.push(['show',   a.target]),
            jsHide:        (a) => applied.push(['hide',   a.target]),
            run:           (a) => applied.push(['run',    a.code]),
        }
    })

    it('runs the forward chain and returns an inverse stack for rollback', () => {
        const chain = [
            { type: 'jsAddClass', target: 'el-1', class: 'liked' },
            { type: 'jsHide',     target: 'el-2' },
        ]
        const { inverseStack, deferred } = applyOptimisticChain(chain, ctx)

        expect(applied).toEqual([
            ['add',  'el-1', 'liked'],
            ['hide', 'el-2'],
        ])
        // Inverse stack is in reverse order so rollback unwinds correctly
        expect(inverseStack).toEqual([
            { type: 'jsShow',        target: 'el-2' },
            { type: 'jsRemoveClass', target: 'el-1', class: 'liked' },
        ])
        expect(deferred).toEqual([])
    })

    it('runs the rollbackable forward chain and defers the rest', () => {
        const chain = [
            { type: 'jsAddClass', target: 'el-1', class: 'liked' },
            { type: 'panel', panelId: 'p1' },           // response-dependent
            { type: 'jsHide',     target: 'el-2' },
        ]
        const { inverseStack, deferred } = applyOptimisticChain(chain, ctx)

        // panel was NOT run pre-AJAX
        expect(applied).toEqual([
            ['add',  'el-1', 'liked'],
            ['hide', 'el-2'],
        ])
        expect(deferred).toEqual([{ type: 'panel', panelId: 'p1' }])
        expect(inverseStack).toEqual([
            { type: 'jsShow',        target: 'el-2' },
            { type: 'jsRemoveClass', target: 'el-1', class: 'liked' },
        ])
    })

    it('does NOT warn for non-rollbackable types — they are deferred, not skipped', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const chain = [{ type: 'panel', panelId: 'p1' }]
        const { inverseStack, deferred } = applyOptimisticChain(chain, ctx)
        expect(warn).not.toHaveBeenCalled()
        // The non-rollbackable action did NOT run pre-AJAX.
        expect(applied).toEqual([])
        expect(deferred).toEqual([{ type: 'panel', panelId: 'p1' }])
        expect(inverseStack).toEqual([])
        warn.mockRestore()
    })

    it('defers multiple non-rollbackable actions in original order', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const chain = [
            { type: 'panel', panelId: 'a' },
            { type: 'modal', modalId: 'b' },
        ]
        const { inverseStack, deferred } = applyOptimisticChain(chain, ctx)
        expect(warn).not.toHaveBeenCalled()
        expect(deferred).toEqual([
            { type: 'panel', panelId: 'a' },
            { type: 'modal', modalId: 'b' },
        ])
        expect(inverseStack).toEqual([])
        warn.mockRestore()
    })
})

describe('applyOptimisticChain — rollback safety in caller', () => {
    // applyOptimisticChain itself just builds the inverse stack; the
    // try/catch around replay lives in _doRequest. We verify the inverse
    // stack is replayable AND that ordering is preserved even if one
    // handler throws.
    //
    // Simulate the _doRequest replay loop manually:
    it('replay loop continues after a thrown inverse handler', () => {
        const errors = []
        const calls = []
        const stubCtx = {
            jsRemoveClass: () => { throw new Error('rollback boom') },
            jsShow:        (a) => calls.push(['show', a.target]),
        }
        const stack = [
            { type: 'jsRemoveClass', target: 'el-1', class: 'liked' },
            { type: 'jsShow',        target: 'el-2' },
        ]

        for (const inv of stack) {
            try { runSubAction(inv, stubCtx) }
            catch (e) { errors.push(e.message) }
        }

        // Both inverses attempted; the boom did not abort the loop.
        expect(errors).toEqual(['rollback boom'])
        expect(calls).toEqual([['show', 'el-2']])
    })
})

describe('runSubAction (used by the dispatch loop and for rollback)', () => {
    let ctx, applied
    beforeEach(() => {
        applied = []
        ctx = {
            jsAddClass:    (a) => applied.push(['add',    a.target, a.class]),
            jsRemoveClass: (a) => applied.push(['remove', a.target, a.class]),
        }
    })
    it('dispatches a single action via the context map', () => {
        runSubAction({ type: 'jsAddClass', target: 'x', class: 'y' }, ctx)
        expect(applied).toEqual([['add', 'x', 'y']])
    })
    it('is a no-op (with warning) for unknown action types', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        runSubAction({ type: 'unknownThing' }, ctx)
        expect(applied).toEqual([])
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})
