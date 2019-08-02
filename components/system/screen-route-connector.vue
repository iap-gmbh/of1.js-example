<template>
  <div></div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { eventBus } from '~/event-bus';
import { createDummyAdapter } from '~/data-adapters/dummy/adapter';
import uuid from 'uuid';
import { IOpenScreenCommand, IScreen, IScreenActivateCommand } from '../../store/screens';
import { ITreeItem, adapter } from './program-tree.vue';
import { State } from 'vuex-class';
import VR from 'vue-router';

@Component({})
export default class ScreenRouteConnector extends Vue {
  public itemTable: ITreeItem[] | null = null;

  private async created(): Promise<void> {
    this.itemTable = await adapter.getFirst();
    this.routeUpdate();
  }

  @State('screens', { namespace: 'of1Screens' })
  private readonly screens!: IScreen[];

  @State('activeScreen', { namespace: 'of1Screens' })
  private readonly activeScreen!: IScreen;

  @Watch('$route')
  private routeUpdate(): void {
    const routeSegment: string | undefined = this.$route.path.split('/')[1];
    if (routeSegment === undefined) return;
    const screens = this.screens;
    const exactMatchingPage = screens.find((screen) => screen.route === routeSegment);
    if (exactMatchingPage) {
      if (exactMatchingPage.id === this.activeScreen.id) return;
      this.$store.commit('of1Screens/activateScreen', { id: exactMatchingPage.id } as IScreenActivateCommand);
      return;
    }

    const baseRoute = routeSegment.split('+')[0];
    const routeEvader = `${baseRoute}+`;
    const alternateMatchingPage = screens.find(
      (screen) => screen.route === baseRoute || screen.route.startsWith(routeEvader)
    );
    if (alternateMatchingPage) {
      if (alternateMatchingPage.id === this.activeScreen.id) return;
      this.$store.commit('of1Screens/activateScreen', { id: alternateMatchingPage.id } as IScreenActivateCommand);
      return;
    }

    const itemToOpen = this.itemTable && this.itemTable.find((screen) => screen.route === baseRoute);
    if (!itemToOpen) throw new Error('Screen with that route could not be found!');

    this.$store.commit('of1Screens/openScreen', {
      screenComponent: itemToOpen.screenComponent,
      route: itemToOpen.route,
      closable: true,
      label: itemToOpen.label,
      labelTranslateable: itemToOpen.labelTranslatable,
      switchNow: true,
    } as IOpenScreenCommand);
  }

  @Watch('activeScreen')
  private screenUpdate(): void {
    if (!this.activeScreen) {
      this.$router.replace('');
      return;
    }
    const path = `/${this.activeScreen.route}`;
    if (this.$route.path === path) return;
    this.$router.replace(path);
  }
}
</script>

<style scoped lang="scss">
</style>
