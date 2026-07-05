<template>
    
    <vl-link 
        v-bind="$_attributes" 
        @click="confirmDelete"
        v-html="$_defaultLabel"
    />

</template>

<script>
import Trigger from '../../form/mixins/Trigger'
export default {
    mixins: [Trigger],
    props: {
        index: {type: Number}, //because addlink doesn't have an index
    },
    data(){
        return {
            confirmComponent: null
        }
    },
    computed:{
        deleteTitle(){
            return this.$_config('deleteTitle')
        },
        $_attributes(){
            return {
                vkompo: Object.assign({}, this.confirmComponent), 
                title: this.deleteTitle,
                kompoid: this.kompoid
            }
        },
        $_defaultLabel(){
            return this.$_label || '<i class="icon-trash" title="'+this.deleteTitle+'"></i>'
        }
    },
    methods: {
        confirmDelete(){
            const modalSpecs = {
                data: Object.assign({}, this.vkompo, {
                    vueComponent: 'DeleteLinkModalContent',
                    itemIndex: this.index,
                    // The real delete runs on the confirm button inside the modal, so its
                    // emitDirect('deleted') is trapped there. Hand a callback to the modal
                    // so the origin link (still mounted in the list/MultiForm row) re-emits
                    // 'deleted' and the row is spliced in place — no whole-form refresh.
                    onDeleted: () => this.$emit('deleted'),
                    class: '',
                    style: '',
                })
            }
            this.$kompo.vlFillModal(modalSpecs, this.kompoid, {
                refreshParent: true,
            })
        },
    },
    created(){
        var confirmComponent = _.cloneDeep(this.vkompo)
        
        confirmComponent.interactions = {}
        this.confirmComponent = confirmComponent
    }
}
</script>
