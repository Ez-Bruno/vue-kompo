import Alert from './Alert'
import KompoAxiosCtor from './KompoAxios'
import { buildJsCtx } from './KompoHelper'

// Last resort only: PHP ships the absolute dispatch route with the response
// (KompoResponse::refresh). Same constant as KompoHelper._buildUrl().
const KOMPO_DISPATCH_ROUTE = '/_kompo'

/**
 * Global handler for Kompo dynamic responses
 * This can be used by any component to handle dynamic responses
 */
export default class KompoResponseHandler {

    /**
     * Finds a Kompo dispatch route among the routes a source has in scope.
     * Only '_kompo' is accepted: X-Kompo-Action batches are handled by the
     * Dispatcher alone, so an action's own route (->post('app.route')) would
     * re-POST the payload to the application endpoint instead.
     */
    static findKompoRoute(source) {
        if (!source) {
            return null
        }

        const candidates = [
            source.$_kAxios && source.$_kAxios.$_kompoRoute,
            source.$_kAxios && source.$_kAxios.$_route,
            source.$_config && source.$_config('kompoRoute'),
            source.$_config && source.$_config('route'),
        ]

        return candidates.find(candidate =>
            _.isString(candidate) && candidate.split('?')[0].replace(/\/+$/, '').endsWith('/_kompo')
        ) || null
    }
    /**
     * Handle a dynamic Kompo response
     * @param {Object} responseData - The response data containing kompoResponseType
     * @param {Object} vueInstance - The Vue component instance
     */
    static handle(responseData, vueInstance, actionContext = null) {
        const { kompoResponseType, content, options = {} } = responseData

        switch (kompoResponseType) {
            case 'modal':
                vueInstance.$kompo.vlFillModal(
                    { data: content }, 
                    vueInstance.$_elKompoId || vueInstance.kompoid, 
                    {
                        confirmFunc: null,
                        warnBeforeClose: options.warnBeforeClose || false,
                        refreshParent: options.refreshParent || false,
                        closeAfterSubmit: options.closeAfterSubmit !== false,
                    }
                )
                break
                
            case 'panel':
                vueInstance.$kompo.vlFillPanel(responseData.panelId, content, {
                    included: options.included || null,
                    refreshParent: options.refreshParent || false,
                    resetAfterSubmit: options.resetAfterSubmit !== false,
                })
                break
                
            case 'drawer':
                vueInstance.$kompo.vlFillDrawer(
                    { data: content }, 
                    vueInstance.$_elKompoId || vueInstance.kompoid, 
                    {
                        warnBeforeClose: options.warnBeforeClose || false,
                        refreshParent: options.refreshParent || false,
                        closeAfterSubmit: options.closeAfterSubmit !== false,
                    }
                )
                break
                
            case 'popup':
                vueInstance.$kompo.vlFillPopup(
                    { data: content }, 
                    {
                        draggable: options.draggable || false,
                        resizable: options.resizable || false,
                    }
                )
                break
                
            case 'redirect':
                setTimeout(() => {
                    if (vueInstance.redirect) {
                        vueInstance.redirect(responseData.url)
                    } else {
                        window.location.href = responseData.url
                    }
                }, options.delay || 50)
                break
                
            case 'alert':
                new Alert().asObject({
                    message: responseData.message,
                    type: responseData.type || 'success',
                    ...options
                }).emitFrom(vueInstance)
                break
                
            case 'refresh': {
                // Mirrors KomponentActions::refresh() (refreshKomponentAction in Action.js):
                // collect each target's kompoInfo via the event bus, batch them in a single
                // $_refreshMany POST, then dispatch vlRefreshKomponent per kompoid so each
                // target replaces its state. Works even when the target has no submitUrl
                // (e.g. top-level Page Forms), unlike vlReloadAfterChildAction.
                const kompoids = responseData.kompoids
                const refreshData = responseData.data

                const ids = kompoids
                    ? (Array.isArray(kompoids) ? kompoids : [kompoids])
                    : (() => {
                        const self = vueInstance.kompoid || vueInstance.$_elKompoId
                        return self ? [self] : []
                    })()

                if (!ids.length) {
                    console.warn('Kompo: refresh response has no target — pass a kompoid to kompoRefresh()')
                    break
                }

                if (!vueInstance.parentKomponentInfo) {
                    vueInstance.parentKomponentInfo = {}
                }

                const askerId = vueInstance.$_elKompoId
                const specifications = []

                ids.forEach(kompoid => {
                    // Synchronous round-trip on the global event bus: the target's
                    // vlRequestKomponentInfo listener fires, synchronously emits
                    // vlDeliverKomponentInfo+askerId, populating parentKomponentInfo[kompoid].
                    vueInstance.$kompo.vlRequestKomponentInfo(kompoid, askerId, {
                        resetFilters: true,
                    })

                    const info = vueInstance.parentKomponentInfo[kompoid]
                    if (!info) {
                        return
                    }

                    specifications.push({
                        kompoid: kompoid,
                        data: Object.assign({}, info.data || {}, refreshData || {}),
                        kompoinfo: info.kompoinfo,
                        page: info.page,
                        sort: info.sort,
                    })
                })

                if (!specifications.length) {
                    console.warn('Kompo: refresh response skipped, target Komponent(s) not live', ids)
                    break
                }

                // Unlike ->refresh(), which carries RouteFinder::getKompoRoute() in its action
                // config, a response has no action to read from. PHP now ships the dispatch
                // route in the body; the rest only covers an older backend.
                const route = responseData.route
                    || KompoResponseHandler.findKompoRoute(actionContext)
                    || KompoResponseHandler.findKompoRoute(vueInstance)
                    || KOMPO_DISPATCH_ROUTE

                const kAxios = (actionContext && actionContext.$_kAxios) || vueInstance.$_kAxios || new KompoAxiosCtor(vueInstance)

                vueInstance.$_state({ loading: true })

                kAxios.$_refreshMany(route, specifications).then(r => {

                    vueInstance.$_state({ loading: false })

                    Object.keys(r.data).forEach(kompoid => {
                        vueInstance.$kompo.vlRefreshKomponent(kompoid, r.data[kompoid])
                    })

                }).catch(e => {

                    vueInstance.$_state({ loading: false })

                    if (actionContext) {
                        actionContext.handleErrorInteraction(e)
                    } else {
                        kAxios.$_handleAjaxError(e)
                    }

                })
                break
            }

            case 'updateElements':
                const targetKompoid = responseData.kompoid || vueInstance.kompoid || vueInstance.$_elKompoId
                if (targetKompoid) {
                    vueInstance.$kompo.vlUpdateElements(targetKompoid, responseData.elements, responseData.transition)
                }
                break

            case 'updateElementValues':
                // Update elements globally by their IDs (targets elements directly, not komponent arrays)
                const updates = responseData.updates || {}
                Object.keys(updates).forEach(elementId => {
                    vueInstance.$kompo.vlUpdateElement(elementId, updates[elementId])
                })
                break

            case 'addToQuery':
                vueInstance.$kompo.vlAddItem(
                    responseData.queryId,
                    responseData.element,
                    responseData.position
                )
                break

            case 'prependToQuery':
                vueInstance.$kompo.vlPrependItem(
                    responseData.queryId,
                    responseData.element
                )
                break

            case 'removeFromQuery':
                vueInstance.$kompo.vlRemoveItemById(
                    responseData.queryId,
                    responseData.itemId
                )
                break

            case 'updateInQuery':
                vueInstance.$kompo.vlUpdateItem(
                    responseData.queryId,
                    responseData.itemId,
                    responseData.element
                )
                break

            case 'run':
                const jsFunction = responseData.jsFunction
                const runData = responseData.data

                vueInstance.$nextTick(() => {
                    if (!jsFunction) {
                        return
                    }

                    // Build context object with response data and vue instance info
                    const ctx = {
                        data: runData,
                        response: runData,
                        el: vueInstance,
                        $el: vueInstance.$el,
                        kompoid: vueInstance.kompoid || vueInstance.$_elKompoId,
                        $kompo: vueInstance.$kompo,
                        ...buildJsCtx(vueInstance, runData),
                    }

                    // Detect arrow functions (including async): () =>, (x) =>, async (x) =>, x =>
                    const isArrowFunction = /^\s*(async\s+)?(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(jsFunction)

                    if (isArrowFunction) {
                        try {
                            let toExecute = eval(jsFunction)
                            toExecute(ctx)
                        } catch (e) {
                            console.error('Kompo kompoRun() error:', e, 'Function:', jsFunction)
                        }
                        return
                    }

                    // Handle named functions on window
                    if (window[jsFunction]) {
                        window[jsFunction](ctx)
                    }

                    // Vue component method
                    if (vueInstance[jsFunction]) {
                        vueInstance[jsFunction](ctx)
                    }
                })
                break

            case 'multi':
                // Execute multiple response actions sequentially
                const actions = responseData.actions || []
                actions.forEach(action => {
                    KompoResponseHandler.handle(action, vueInstance, actionContext)
                })
                break

            default:
                console.warn('Unknown Kompo response type:', kompoResponseType)
        }
    }
}
