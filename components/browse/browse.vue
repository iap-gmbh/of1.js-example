<template>
  <div>
    <slot></slot>
    <AgGridVue
      class="ag-theme-material of1-grid"
      rowSelection="single"
      suppressCellSelection
      rowModelType="clientSide"
      :disabled="disabled"
      :columnDefs="columnDefs"
      :rowData="rowData"
      :navigateToNextCell="onNavigation"
      @row-selected="rowSelected"
      @gridReady="gridReady"
      @rowDataChanged="rowDataChanged"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator';
import { AgGridVue } from 'ag-grid-vue';
import {
  ColDef,
  RowSelectedEvent,
  GridReadyEvent,
  GridApi,
  ColumnApi,
  RowDataChangedEvent,
  NavigateToNextCellParams,
  GridCellDef,
} from 'ag-grid-community';
import { VNode } from 'vue';
import { Datafield } from '~/store/data-sources/data-source-helpers';
import BrowseColumn from './browse-column.vue';

@Component({
  components: {
    AgGridVue,
  },
})
export default class Browse extends Vue {
  @Prop({ required: true }) private readonly datasource!: string | undefined;

  private gridApi: GridApi | null = null;
  private columnApi: ColumnApi | null = null;
  private columnDefs: ColDef[] = [];
  private invalidated: boolean = false;

  private get rowData(): any[] {
    const source = this.$of1Datasource(this.datasource);
    if (!source) return [];
    return source.records;
  }

  private get datasourcePosition(): number {
    const source = this.$of1Datasource(this.datasource);
    if (!source) return 0;
    return source.pointer;
  }

  private get disabled(): boolean {
    const source = this.$of1Datasource(this.datasource);
    if (!source) return false;
    return !source.browsing;
  }

  private created(): void {
    this.$on('columnsInvalidated', this.invalidateColumns);
  }

  private mounted(): void {
    this.columnsUpdated();
  }

  private columnsUpdated(): void {
    const colDefs: ColDef[] = [];
    // Not all children are BrowseColumns. There are also divs and the ag-grid.
    for (const child of this.$children as any[]) {
      if (child.getBrowseColumn) {
        colDefs.push(child.getBrowseColumn());
      }
    }
    this.columnDefs = colDefs;
  }

  public invalidateColumns(): void {
    if (this.invalidated) return;
    this.invalidated = true;
    this.$nextTick(() => {
      this.columnsUpdated();
      this.invalidated = false;
    });
  }

  //#region Event handlers
  public rowSelected(ev: RowSelectedEvent): void {
    if (!ev.node.isSelected()) return;
    const source = this.$of1Datasource<any>(this.datasource);
    if (!source) return;
    if (source.activeRecord && ev.data.id === source.activeRecord.id) return;

    source.repositionById(ev.data.id);
  }

  public gridReady(ev: GridReadyEvent): void {
    this.gridApi = ev.api;
    this.columnApi = ev.columnApi;
    this.positionWatcher();
  }

  /**
   * When the row data is changed, the selection is lost. So we need to recreate it.
   */
  private rowDataChanged(ev: RowDataChangedEvent): void {
    this.positionWatcher();
  }
  //#endregion Event handlers

  @Watch('datasourcePosition')
  public positionWatcher(newPosition?: number): void {
    let position = newPosition;
    if (position === undefined) {
      const source = this.$of1Datasource(this.datasource);
      if (!source) return;
      position = source.pointer;
    }

    if (!this.gridApi) return;

    this.gridApi.forEachNode((node) => {
      node.setSelected(node.rowIndex === position);
    });
  }

  public onNavigation(params: NavigateToNextCellParams): GridCellDef | null {
    if (this.disabled) return null;
    if (!this.gridApi) return null;

    const previousCell = params.previousCellDef;
    const suggestedNextCell = params.nextCellDef;

    const KEY_UP = 38;
    const KEY_DOWN = 40;
    const KEY_LEFT = 37;
    const KEY_RIGHT = 39;

    switch (params.key) {
      case KEY_DOWN:
        this.selectRowWithIndex(previousCell.rowIndex + 1);
        return suggestedNextCell;
      case KEY_UP:
        this.selectRowWithIndex(previousCell.rowIndex - 1);
        return suggestedNextCell;
      case KEY_LEFT:
      case KEY_RIGHT:
        return suggestedNextCell;
    }
    return null;
  }

  private selectRowWithIndex(index: number): void {
    if (!this.gridApi) return;

    this.gridApi.forEachNode((node) => {
      if (node.rowIndex !== index) return;
      this.gridApi!.deselectAll();
      node.setSelected(true);
    });
  }
}
</script>

<style lang="scss" scoped>
@import '../../../node_modules/ag-grid-community/dist/styles/ag-grid.css';
@import '../../../node_modules/ag-grid-community/dist/styles/ag-theme-balham.css';
@import '../../../node_modules/ag-grid-community/dist/styles/ag-theme-balham-dark.css';
@import '../../../node_modules/ag-grid-community/dist/styles/ag-theme-blue.css';
@import '../../../node_modules/ag-grid-community/dist/styles/ag-theme-dark.css';
@import '../../../node_modules/ag-grid-community/dist/styles/ag-theme-fresh.css';
@import '../../../node_modules/ag-grid-community/dist/styles/ag-theme-material.css';

.of1-grid {
  width: 100%;
  height: 350px;

  &[disabled] {
    pointer-events: none;
  }
}
</style>
