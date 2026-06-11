export default {
    created(){
        window._kompo.sessionTimeoutMessage = this.$_config('sessionTimeoutMessage')
    },
	computed: {

        $_kompoInfo() { return this.$_config('X-Kompo-Info') },

        $_deliverKompoInfoOff() { return 'vlGetKomponentInfo'+this.$_elKompoId },

        $_pusherRefresh(){ return this.component.pusherRefresh },

        $_isLive(){ return window._kompo.komponents.includes(this.$_elKompoId) },

    },
    methods:{
        $_deliverKompoInfoOn(){
            this.$_vlOn('vlGetKomponentInfo'+this.$_elKompoId, (askerId) => {

                this.$kompo.vlDeliverKompoInfo(askerId, this.$_kompoInfo)
                
            })
        },
        $_configureEcho(){

            if(!this.$_pusherRefresh)
                return

            if (typeof Echo === 'undefined') {
                console.warn('[kompo] pusherRefresh configured but window.Echo is not initialized', this.$_pusherRefresh)
                return
            }

            Object.keys(this.$_pusherRefresh).forEach((key) => {

                const channel = Echo.private(key)

                // Private-channel auth failures are otherwise completely silent
                // (pusher-js only logs with Pusher.logToConsole=true): a 403 here
                // means this client receives NO live updates and NO whispers
                channel.error((e) => {
                    console.warn('[kompo] channel subscription failed', key, e)
                })

                this.$_pusherRefresh[key].forEach((message) => {

                    window._kompo.echo.push({
                        channel: key, message: message //saving specs for stopListening later
                    })

                    channel.listen(message, (e) => {

                        this.$_echoTrigger()

                    })

                })
            })
        },
        $_saveLiveKomponent(){
            window._kompo.komponents.push(this.$_elKompoId)       
        },
        $_removeLiveKomponent(){
            window._kompo.komponents = _.filter(window._kompo.komponents, (n) => n !== this.$_elKompoId)
        },
        $_echoTrigger(){}, //to be overriden in Komponent
    }
}