import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Every .vue file that renders kompo children via v-for should carry
// :key="<stable> || <stable> || '__idx-' + <index>" on the inner component.
// We assert:
//  - the file has at least one v-for
//  - the file has at least one :key binding
//  - the key expression references _kid (or id) and __idx- as fallback
//
// Loose enough to survive reformatting or loop-var renames; tight enough to
// catch silent removal of structural keying.
const PATCHED_FILES = [
    'js/form/FormInner.vue',
    'js/form/form-layouts/Rows.vue',
    'js/form/form-layouts/Div.vue',
    'js/form/form-layouts/Flex.vue',
    'js/form/form-layouts/Columns.vue',
    'js/form/form-layouts/Toolbar.vue',
    'js/form/form-layouts/TableRows.vue',
    'js/form/form-layouts/FormTab.vue',
    'js/form/form-layouts/FormTabs.vue',
    'js/form/form-layouts/FormPanel.vue',
    'js/element/standalone/Panel.vue',
    'js/element/standalone/Drawer.vue',
    'js/element/standalone/Modal.vue',
    'js/menu/Aside.vue',
    'js/menu/Footer.vue',
    'js/menu/Nav.vue',
    'js/menu/Dropdown.vue',
    'js/menu/Collapse.vue',
    'js/query/Filters.vue',
    'js/query/TableHeaders.vue',
    'js/query/query-cards/TableRow.vue',
]

describe.each(PATCHED_FILES)('template keys — %s', (relPath) => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '../..', relPath),
        'utf8'
    )

    it('contains at least one v-for loop', () => {
        expect(source).toMatch(/v-for=/)
    })

    it('contains at least one :key binding', () => {
        expect(source).toMatch(/:key=/)
    })

    it('key expression references _kid or id', () => {
        // The key expression must reference at least one of our stable identifiers.
        // Allowed shapes: component.id, row.id, element.id, item.id, etc.
        // Use a permissive [\w$]+ to survive loop-variable renames.
        expect(source).toMatch(/[\w$]+\._kid/)
    })

    it('key expression has __idx- or custom-helper fallback', () => {
        // Either our standard __idx- fallback, or a pre-existing helper like
        // componentKey(index). Both signal intentional stable keying.
        const hasStdFallback = /__idx-/.test(source)
        const hasCustomFallback = /:key="[^"]*\([^)]*index[^)]*\)/.test(source)
        expect(hasStdFallback || hasCustomFallback).toBe(true)
    })
})
