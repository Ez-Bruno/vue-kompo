/**
 * Recursively searches `elements` for a child with matching id or _kid,
 * replacing it in-place via the provided `setter` callback.
 *
 * This helper is pure — it receives a `setter(array, index, value)` callback
 * so callers (Vue components) can pass `this.$set.bind(this)` to trigger
 * reactivity; plain-JS callers can pass a direct-assign setter.
 *
 * @param {Array} elements
 * @param {string} id — the id or _kid to match
 * @param {Object} newElement — the replacement
 * @param {Function} setter — (array, index, value) => void
 * @returns {boolean} true if replacement happened
 */
export function replaceElementById(elements, id, newElement, setter) {
    if (!Array.isArray(elements)) return false

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        if (!el) continue

        if (el.id === id || el._kid === id) {
            setter(elements, i, newElement)
            return true
        }

        if (Array.isArray(el.elements)) {
            if (replaceElementById(el.elements, id, newElement, setter)) {
                return true
            }
        }
    }
    return false
}
