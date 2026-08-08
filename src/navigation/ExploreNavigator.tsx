import React, { useEffect, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBar,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import FeedScreen from '../screens/Explore/FeedScreen';
import MarketScreen from '../screens/Explore/MarketScreen';
import ProductDetailScreen from '../screens/Explore/ProductDetailScreen';
import { useChatSettings } from '../context/ChatSettingsContext';
import { MOBILE_BREAKPOINT } from './navigationUtils';

const Tab = createMaterialTopTabNavigator();
const MarketStack = createStackNavigator();

const DESKTOP_RAIL_W = 128;

const EXPLORE_TABS: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }
> = {
  Moment: { label: 'Moment', icon: 'images-outline', activeIcon: 'images' },
  Market: { label: 'Market', icon: 'storefront-outline', activeIcon: 'storefront' },
};

const MarketStackScreen = () => (
  <MarketStack.Navigator>
    <MarketStack.Screen
      name="MarketMain"
      component={MarketScreen}
      options={{ headerShown: false }}
    />
    <MarketStack.Screen
      name="ProductDetail"
      component={ProductDetailScreen}
      options={{ headerShown: false }}
    />
  </MarketStack.Navigator>
);

function ExploreDesktopVerticalTabBar({
  state,
  navigation,
  activeColor,
  inactiveColor,
  backgroundColor,
  borderColor,
}: MaterialTopTabBarProps & {
  activeColor: string;
  inactiveColor: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.desktopRail, { backgroundColor, borderColor }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const meta = EXPLORE_TABS[route.name] ?? {
          label: route.name,
          icon: 'ellipse-outline' as const,
          activeIcon: 'ellipse' as const,
        };
        const color = focused ? activeColor : inactiveColor;
        return (
          <TouchableOpacity
            key={route.key}
            style={[styles.desktopItem, focused && { backgroundColor: `${activeColor}14` }]}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
          >
            <Ionicons
              name={focused ? meta.activeIcon : meta.icon}
              size={22}
              color={color}
            />
            <Text style={[styles.desktopLabel, { color }]}>{meta.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Pushes tab-bar props to the sibling rail (rail must sit outside TabView). */
function TabBarPropsBridge({
  props,
  onProps,
}: {
  props: MaterialTopTabBarProps;
  onProps: (props: MaterialTopTabBarProps) => void;
}) {
  const routeKey = props.state.routes[props.state.index]?.key;
  useEffect(() => {
    onProps(props);
    // Only re-sync when the focused route changes — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, props.state.index, onProps]);
  return null;
}

function ExploreDesktop({
  theme,
}: {
  theme: ReturnType<typeof useChatSettings>['theme'];
}) {
  const [tabBarProps, setTabBarProps] = useState<MaterialTopTabBarProps | null>(null);

  return (
    <View style={styles.desktopRoot}>
      <View style={styles.desktopRailHost}>
        {tabBarProps ? (
          <ExploreDesktopVerticalTabBar
            {...tabBarProps}
            activeColor={theme.primary}
            inactiveColor={theme.tabInactive}
            backgroundColor={theme.listCardBg}
            borderColor={theme.listBorder}
          />
        ) : null}
      </View>

      {/* TabView only measures THIS column — scenes get the real content width. */}
      <View style={styles.desktopMain}>
        <Tab.Navigator
          tabBar={(props) => (
            <TabBarPropsBridge props={props} onProps={setTabBarProps} />
          )}
          screenOptions={{
            swipeEnabled: false,
            animationEnabled: false,
            tabBarStyle: { height: 0, overflow: 'hidden', elevation: 0 },
            sceneStyle: styles.desktopScene,
          }}
        >
          <Tab.Screen name="Moment" component={FeedScreen} options={{ title: 'Moment' }} />
          <Tab.Screen name="Market" component={MarketStackScreen} />
        </Tab.Navigator>
      </View>
    </View>
  );
}

const ExploreNavigator = () => {
  const { theme } = useChatSettings();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;

  if (isDesktop) {
    return <ExploreDesktop theme={theme} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.listBg }]}>
      <Tab.Navigator
        tabBar={(props) => <MaterialTopTabBar {...props} />}
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.tabInactive,
          tabBarIndicatorStyle: {
            backgroundColor: theme.primary,
            height: 3,
            borderRadius: 2,
          },
          tabBarLabelStyle: { fontSize: 14, fontWeight: '600', textTransform: 'none' },
          tabBarStyle: {
            backgroundColor: theme.listCardBg,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.listBorder,
          },
          tabBarPressColor: 'rgba(0,122,255,0.08)',
        }}
      >
        <Tab.Screen name="Moment" component={FeedScreen} options={{ title: 'Moment' }} />
        <Tab.Screen name="Market" component={MarketStackScreen} />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    minWidth: 0,
  },
  desktopRailHost: {
    width: DESKTOP_RAIL_W,
    flexShrink: 0,
    zIndex: 2,
  },
  desktopRail: {
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingHorizontal: 10,
    gap: 4,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  desktopScene: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  desktopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  desktopLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ExploreNavigator;
