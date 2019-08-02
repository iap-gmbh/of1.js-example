import uuid from 'uuid';
import { Module, Store } from 'vuex';
import { IOF1DataAdapter, IOF1DataRecord } from '~/data-adapters/interfaces';

export enum UpdateMode {
  /**
   * The activeRecord is the currently selected record, but can be modified. 'cancel' will reset the activeRecord.
   * After both actions, the mode will change to 'B'. The 'new', 'update' and 'copy' actions have no effect. The
   * pointer cannot be moved.
   */
  Update = 'U',
  /**
   * The activeRecord is a new record, not currently available through the data adapter and can be modified.
   * 'save' will attempt to create the new record through the data adapter. 'cancel' will discard the activeRecord.
   * After both actions, the mode will change to 'B'. The 'new', 'update' and 'copy' actions have no effect.
   * The pointer cannot be moved.
   */
  Add = 'A',
  /**
   * The activeRecord is a new record, not currently available through the data adapter, but based on the
   * selectedRecord, and can be modified. 'save' will attempt to create the new record through the data adapter.
   * 'cancel' will discard the activeRecord. After both actions, the mode will change to 'B'. The 'new', 'update' and
   * 'copy' actions have no effect. The pointer cannot be moved.
   */
  Copy = 'C',
  /**
   * In this mode, the activeRecord cannot be modified and the pointer can be freely moved. The 'new', 'update' and
   * 'copy' actions can be to transition to other states. 'cancel' and 'save' have no effect.
   */
  Browse = 'B',
}

export interface IDatasourceOptions<T extends IOF1DataRecord> {
  /**
   * If true, when a record is selected, to increse the responsiveness of the application, a browse record with the
   * same id can be temporarily copied to the viewer, while the datasource is fetching the correct record from the
   * data adapter
   */
  // allowTemporaryViewerRecord: boolean = false;

  /**
   * Fields that should be loaded for collection records.
   * Leave empty to load all fields.
   */
  collectionRecordFields?: Array<keyof T>;

  /**
   * Fields that should be loaded for active records.
   * Leave empty to load all fields.
   */
  activeRecordFields?: Array<keyof T>;

  /**
   * Number of records per batch
   */
  batchSize?: number;
}

export interface IDatasourceState<T extends IOF1DataRecord> {
  /**
   * The currently selected record
   */
  activeRecord: T | null;

  /**
   * A copy of the currently selected record as it was returned by data adapter.
   * Used for references that should not update while editing and for detecting
   * changes.
   */
  originalRecord: T | null;

  /**
   * A batch of currently loaded records
   */
  records: T[];

  /**
   * The current action that is performed on the datasource.
   */
  updateMode: UpdateMode;

  /**
   * The position of the activeRecord in the records collection. Can be -1,
   * which means that it isn't in the records collection. This can occur
   * when the datasource is in add mode or if the datasource is repositioned
   * manually by record id.
   */
  pointer: number;

  /**
   * A locked dataset will refuse do change records and change the data in
   * the active record, until the lock is released. This is done while
   * changes are commited to the database. (create, update, delete)
   */
  locked: boolean;
}

const defaultBatchSize = 50;

export function createDatasource<T extends IOF1DataRecord>(
  store: Store<any>,
  adapter: IOF1DataAdapter<T>,
  options: IDatasourceOptions<T>
): string {
  if (options.batchSize === undefined) options.batchSize = defaultBatchSize;
  let fetchAbortController: AbortController | null = null;
  let batchAbortController: AbortController | null = null;
  const name = uuid.v4();
  const module: Module<IDatasourceState<T>, never> = {
    namespaced: true,
    state: {
      originalRecord: null,
      activeRecord: null,
      records: [],
      updateMode: UpdateMode.Browse,
      pointer: -1,
      locked: false,
    } as IDatasourceState<T>,
    mutations: {
      setCollection(state, records: T[]): void {
        state.records = records;
      },
      setActiveRecord(state, { record, preserveOriginal }: { record: T; preserveOriginal?: boolean }): void {
        if (state.locked) throw errorLocked();
        state.activeRecord = record;
        if (!preserveOriginal) {
          state.originalRecord = { ...record };
        }

        const position = state.records.findIndex((x) => x.id === record.id);
        state.pointer = position;
      },
      setUpdateMode(state, updateMode: UpdateMode): void {
        if (state.locked) throw errorLocked();
        state.updateMode = updateMode;
      },
      update(state, { field, value }: { field: keyof T; value: T[keyof T] }): void {
        if (state.locked) throw errorLocked();
        if (state.updateMode === UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode, UpdateMode.Browse);
        if (!state.activeRecord) throw error('Cannot update record, since none is selected.');
        if (!state.activeRecord.hasOwnProperty(field)) {
          throw error("Cannot update field, since it's not in the record.");
        }

        state.activeRecord[field] = value;
      },
      lock(state): void {
        if (state.locked) throw errorLocked();
        state.locked = true;
      },
      unlock(state): void {
        if (state.locked) throw error('Datasource is not locked.');
        state.locked = false;
      },
    },
    actions: {
      async init({ state, commit }): Promise<void> {
        if (state.locked) throw errorLocked();
        if (batchAbortController) {
          batchAbortController.abort();
        }
        if (fetchAbortController) {
          fetchAbortController.abort();
        }

        const localBatchAbortController = new AbortController();
        batchAbortController = localBatchAbortController;
        const records = await adapter.getFirst(
          {
            columns: options.collectionRecordFields,
            count: options.batchSize,
          },
          localBatchAbortController.signal
        );

        if (localBatchAbortController.signal.aborted) return;
        batchAbortController = null;

        let record: T | null = null;
        const localFetchAbortController = new AbortController();
        fetchAbortController = localFetchAbortController;
        if (records.length > 0) {
          const firstRecordId = records[0].id;
          const firstRecord = await adapter.getRecord(
            firstRecordId,
            options.activeRecordFields,
            localFetchAbortController.signal
          );
          if (firstRecord) {
            record = firstRecord;
          }
        }

        commit('setCollection', records);
        if (!localFetchAbortController.signal.aborted) {
          commit('setActiveRecord', { record });
        }
        commit('setUpdateMode', UpdateMode.Browse);
      },
      //#region record positioning
      async reposition({ state, dispatch }, pos): Promise<boolean> {
        if (state.locked) throw errorLocked();
        if (state.updateMode !== UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode, UpdateMode.Browse);

        const record = state.records[pos] as T | undefined;
        if (!record) throw error('No such position.');

        return await dispatch('repositionById', record.id);
      },
      async repositionById({ state, commit }, id): Promise<boolean> {
        if (state.locked) throw errorLocked();
        if (state.updateMode !== UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode, UpdateMode.Browse);

        if (fetchAbortController) {
          fetchAbortController.abort();
        }
        const localFetchAbortController = new AbortController();
        fetchAbortController = localFetchAbortController;
        const newRecord = await adapter.getRecord(id, options.activeRecordFields, localFetchAbortController.signal);

        if (!fetchAbortController.signal.aborted) {
          commit('setActiveRecord', { record: newRecord });
          return true;
        }
        return false;
      },
      async prev({ state, dispatch }): Promise<void> {
        if (state.pointer > 0) {
          await dispatch('reposition', state.pointer - 1);
        }
      },
      async next({ state, dispatch }): Promise<void> {
        if (state.pointer + 1 < state.records.length) {
          await dispatch('reposition', state.pointer + 1);
        }
      },
      //#endregion record positioning
      //#region state transitions
      edit({ state, commit }): void {
        if (state.locked) throw errorLocked();
        if (state.updateMode !== UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode, UpdateMode.Browse);
        if (!state.originalRecord) error('Cannot enter edit mode, since there is no original record');
        commit('setUpdateMode', UpdateMode.Update);
      },
      add({ state, commit }): void {
        if (state.locked) throw errorLocked();
        if (state.updateMode !== UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode, UpdateMode.Browse);

        commit('setUpdateMode', UpdateMode.Add);
        const record = {} as T;

        if (state.activeRecord) {
          for (const key of Object.keys(state.activeRecord)) {
            record[key as keyof T] = null!;
          }
        }

        commit('setActiveRecord', { record, preserveOriginal: true });
      },
      copy({ state, commit }): void {
        if (state.locked) throw errorLocked();
        if (state.updateMode !== UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode, UpdateMode.Browse);

        commit('setUpdateMode', UpdateMode.Copy);
        let record = {} as T;

        if (state.activeRecord) {
          record = { ...state.activeRecord };
        }

        commit('setActiveRecord', { record, preserveOriginal: true });
      },
      async save({ state, dispatch, commit }): Promise<void> {
        if (state.locked) throw errorLocked();
        if (state.updateMode === UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode);
        if (!state.activeRecord) {
          throw error('Save action has no active record!');
        }

        let newRecord: T | null = null;
        try {
          commit('lock');
          switch (state.updateMode) {
            case UpdateMode.Add:
              newRecord = await adapter.create(state.activeRecord);
              break;
            case UpdateMode.Copy:
              newRecord = await adapter.create(state.activeRecord);
              break;
            case UpdateMode.Update:
              if (!state.originalRecord) {
                throw error('Update save action has no original record!');
              }
              newRecord = await adapter.update(state.activeRecord, state.originalRecord);
              break;
          }
        } finally {
          commit('unlock');
        }

        commit('setActiveRecord', { record: newRecord });
        await dispatch('init');
      },
      async cancel({ state, commit }): Promise<void> {
        if (state.locked) throw errorLocked();
        if (state.updateMode === UpdateMode.Browse) throw errorUnexpectedMode(state.updateMode);

        commit('setActiveRecord', { record: state.originalRecord });
        commit('setUpdateMode', UpdateMode.Browse);
      },
      //#endregion state transitions
    },
  };

  store.registerModule(`of1_ds_${name}`, (module as any) as Module<IDatasourceState<T>, any>);
  return name;

  function error(text: string): Error {
    return new Error(`${text} (DS ${name})`);
  }

  function errorLocked(): Error {
    return error('Datasource is locked.');
  }

  function errorUnexpectedMode(currentMode: UpdateMode, expectedMode?: UpdateMode): Error {
    let text = 'Datasource is in the incorrect update mode. ';
    if (expectedMode !== undefined) {
      text += `Expected: ${UpdateMode[expectedMode as any]}, but `;
    }
    text += `but found: ${UpdateMode[currentMode as any]}`;

    return error(text);
  }
}
