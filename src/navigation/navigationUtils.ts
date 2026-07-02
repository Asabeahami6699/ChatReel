/** Match auth screens: below this width use phone layout on web. */
export const MOBILE_BREAKPOINT = 768;

type NavState = {
  index: number;
  routes: { name: string; state?: NavState }[];
};

export function getFocusedRouteName(state: NavState | undefined): string | undefined {
  if (!state?.routes?.length) return undefined;
  const route = state.routes[state.index];
  if (route.state) {
    return getFocusedRouteName(route.state);
  }
  return route.name;
}
