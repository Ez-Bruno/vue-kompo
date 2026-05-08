<template>
    <nav v-bind="$_menuAttributes">
        <transition-group
            v-if="$_hasTransition"
            :name="$_transition"
            tag="div"
            class="vlMenuElements">
            <component
                v-for="(element, index) in elements"
                :key="element.id || element._kid || '__idx-' + index"
                v-bind="$_attributes(element)"
            />
        </transition-group>
        <template v-else v-for="(element, index) in elements">
            <component :key="element.id || element._kid || '__idx-' + index" v-bind="$_attributes(element)"/>
        </template>
    </nav>
</template>

<script>
import IsMenu from './mixins/IsMenu'

export default {
    mixins: [IsMenu],
    computed: {
        $_hasTransition() {
            return !!this.$_config('transition')
        },
        $_transition() {
            return this.$_config('transition') || ''
        },
    },
}
</script>
