/** Match auth screens: below this width use phone layout on web. */
export const MOBILE_BREAKPOINT = 768;

type NavState = {
  index?: number;
  routes: { name: string; state?: NavState }[];
};

export function getFocusedRouteName(state: NavState | undefined): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index =
    typeof state.index === 'number' && state.index >= 0 && state.index < state.routes.length
      ? state.index
      : state.routes.length - 1;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state) {
    return getFocusedRouteName(route.state);
  }
  return route.name;
}
