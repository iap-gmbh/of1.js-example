<template>
  <q-layout view="hHh LpR fFf">
    <ScreenRouteConnector />
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="menu" @click="left = !left" v-if="$q.screen.lt.md" />
        <q-toolbar-title>
          <q-avatar>
            <img class="logo" src="~/assets/logo.png" />
          </q-avatar>OF1.js
        </q-toolbar-title>
        <q-select
          outlined
          v-model="$i18n.locale"
          :options="languages"
          filled
          emit-value
          map-options
          dense
          bg-color="white"
        />
        <TabScreenSelector />
      </q-toolbar>
    </q-header>
    <q-drawer v-model="left" side="left" elevated>
      <ProgramTree />
    </q-drawer>
    <q-page-container>
      <ScreenContainer />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import ProgramTree from './program-tree.vue';
import TabScreenSelector from './tab-screen-selector.vue';
import ScreenContainer from './screen-container.vue';
import ScreenRouteConnector from './screen-route-connector.vue';
import uuid from 'uuid';
import { TranslateResult } from 'vue-i18n';
import { IOpenScreenCommand } from '../../store/screens';

interface IQuasarOption {
  label: TranslateResult;
  value: string;
}

@Component({
  components: {
    ProgramTree,
    ScreenContainer,
    TabScreenSelector,
    ScreenRouteConnector,
  },
})
export default class Desktop extends Vue {
  private readonly langCodes: string[] = ['en', 'de'];
  private readonly left: boolean = true;
  private get languages(): IQuasarOption[] {
    return this.langCodes.map((langCode) => {
      return {
        label: this.$t('name', langCode),
        value: langCode,
      };
    });
  }

  public created(): void {
    const lastId = this.$store.state.of1Screens.lastId;
    // Avoid opening start screen twice through hot reloading
    if (lastId !== 0) return;
    this.$store.commit('of1Screens/openScreen', {
      screenComponent: 'Start',
      route: '',
      closable: false,
      label: 'Start',
      labelTranslateable: false,
      switchNow: true,
    } as IOpenScreenCommand);
  }
}
</script>

<style scoped lang="scss">
img.logo {
  height: 32px;
  vertical-align: middle;
}
</style>
