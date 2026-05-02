import Alert from './Alert'
import KompoAxiosCtor from './KompoAxios'
import { buildJsCtx } from './KompoHelper'

/**
 * Global handler for Kompo dynamic responses
 * This can be used by any component to handle dynamic responses
 */
export default class KompoResponseHandler {
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
                    break
                }

                // Resolve the kompo route from any available source. The action that just
                // received this response was POSTed there, but for action types without a
                // 'route' config (e.g. submit-form), fall back to the vue's kompoRoute config
                // or hop through any live Komponent that exposes it.
                const route =
                    (actionContext && actionContext.$_kAxios && (actionContext.$_kAxios.$_route || actionContext.$_kAxios.$_kompoRoute)) ||
                    (actionContext && actionContext.$_config && (actionContext.$_config('route') || actionContext.$_config('kompoRoute'))) ||
                    (vueInstance.$_kAxios && (vueInstance.$_kAxios.$_route || vueInstance.$_kAxios.$_kompoRoute)) ||
                    (vueInstance.$_config && (vueInstance.$_config('kompoRoute') || vueInstance.$_config('route'))) ||
                    null

                if (!route) {
                    console.warn('Kompo: refresh response skipped, no kompo route available', {
                        askerId,
                        hasActionContext: !!actionContext,
                        actionConfigRoute: actionContext && actionContext.actionConfig && actionContext.actionConfig.route,
                        actionKAxiosRoute: actionContext && actionContext.$_kAxios && actionContext.$_kAxios.$_route,
                        actionKAxiosKompoRoute: actionContext && actionContext.$_kAxios && actionContext.$_kAxios.$_kompoRoute,
                        vueConfigKompoRoute: vueInstance.$_config && vueInstance.$_config('kompoRoute'),
                        vueConfigRoute: vueInstance.$_config && vueInstance.$_config('route'),
                    })
                    break
                }

                const kAxios = (actionContext && actionContext.$_kAxios) || vueInstance.$_kAxios || new KompoAxiosCtor(vueInstance)

                kAxios.$_refreshMany(route, specifications).then(r => {
                    Object.keys(r.data).forEach(kompoid => {
                        vueInstance.$kompo.vlRefreshKomponent(kompoid, r.data[kompoid])
                    })
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

                    // Detect arrow functions: () =>, (x) =>, (a, b) =>, x =>
                    const isArrowFunction = /^\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(jsFunction)

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
