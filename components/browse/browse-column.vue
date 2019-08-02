<template></template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { ColDef } from 'ag-grid-community';
import Browse from './browse.vue';

@Component({})
export default class BrowseColumn extends Vue {
  @Prop({ type: String, required: true }) private readonly field!: string;
  @Prop({ type: String, default: '' }) private readonly label!: string;

  private created(): void {
    this.update();
  }

  @Watch('field')
  @Watch('label')
  private update(): void {
    const parent = this.$parent as Browse;
    if (parent) {
      parent.$emit('columnsInvalidated');
    }
  }

  public getBrowseColumn(): ColDef {
    return {
      field: this.field,
      headerName: this.label !== '' ? this.label : undefined,
    };
  }
}
</script>

<style lang="scss" scoped>
</style>
