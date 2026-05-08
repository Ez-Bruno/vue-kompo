<template>
    <div v-if="filters.length" :class="'vlFilters'+placement">
        <template v-for="(filter, index) in filters">
            <component
                :key="filter.id || filter._kid || '__idx-' + index"
                :is="$_vueTag(filter)"
                :vkompo="filter"
                :kompoid="kompoid"
            />
        </template>
    </div>
</template>

<script>
import HasVueComponent from '../element/mixins/HasVueComponent'

export default {
    mixins: [HasVueComponent],

    props: {
        filters: { type: Array, required: true },
        kompoid: { type: String, required: true },
        placement: {type: String, required: true }
    },

    methods: {
        filterPlacement(){
            return 'vlFilters'+this.placement
        }
    }
}

</script>
