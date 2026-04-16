import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { StackScreenProps } from '@react-navigation/stack';
// Use JS-based stack for all navigators to avoid native header event crashes (topWillDisappear, topHeaderHeightChange)
// during navigation transitions. This is critical when using custom native components like HandCameraView
// that have their own lifecycle management.
import {
  createStackNavigator,
  CardStyleInterpolators,
} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Feather';
import { enableScreens } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentsScreen } from '../screens/PaymentsScreen';
import { ReferralsScreen } from '../screens/ReferralsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BountiesScreen } from '../screens/BountiesScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ForgotPasswordOtpScreen } from '../screens/ForgotPasswordOtpScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { SignupStepperScreen } from '../screens/SignupStepperScreen';
import { ApplicationPendingScreen } from '../screens/ApplicationPendingScreen';
import { ProfileCompletionScreen } from '../screens/ProfileCompletionScreen';
import { TaskRecordingScreen } from '../screens/TaskRecordingScreen';
import { useAuthStore } from '../state/useAuthStore';
import { useForgotPassword } from '../hooks/useAuth';
import { colors } from '../theme';
import { scaleFont } from '../theme/scale';

export type RootStackParamList = {
  Auth: undefined;
  Pending: undefined;
  ProfileCompletion: undefined;
  App: undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
  ForgotEmail: undefined;
  ForgotOtp: { email: string };
  ForgotReset: { token: string };
  Signup: undefined;
};

// 4 bottom tabs (Recording removed - it's now a separate stack screen)
export type TabParamList = {
  Bounties: undefined;
  Payments: undefined;
  Referrals: undefined;
  Settings: undefined;
};

// App stack includes tabs and TaskRecording screen
export type AppStackParamList = {
  Main: undefined;
  TaskRecording: undefined;
};

// Use JS-based stack navigators to avoid native header event crashes (topWillDisappear, topHeaderHeightChange)
// during navigation transitions. This is critical when using custom native components like HandCameraView
// that have their own lifecycle management.
const RootStack = createStackNavigator<RootStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();
const AppStack = createStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Disable native screens to prevent topWillDisappear/topHeaderHeightChange events
// that can crash when using custom native components like HandCameraView
enableScreens(false);

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
  },
};

// Tab Navigator with 4 tabs (Recording moved to separate stack screen)
function TabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <Tab.Navigator
      initialRouteName="Bounties"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subduedText,
        lazy: true,
        // Disable detachInactiveScreens to prevent native component lifecycle issues
        // with Fabric during screen transitions
        detachInactiveScreens: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 60 + bottomInset,
          borderTopWidth: 1,
          shadowRadius: 10,
          marginHorizontal: 10,
        },
        tabBarLabelStyle: {
          fontSize: scaleFont(10),
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => {
          const icon = getTabIcon(route.name);
          return <Icon name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Bounties" component={BountiesRoute} />
      <Tab.Screen name="Payments" component={PaymentsScreen} />
      <Tab.Screen name="Referrals" component={ReferralsRoute} />
      <Tab.Screen name="Settings" component={SettingsRoute} />
    </Tab.Navigator>
  );
}

// App Stack Navigator - includes tabs and TaskRecording screen
function AppStackNavigator() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerShown: false,
        // Freeze screens when blurred to prevent race conditions during navigation
        freezeOnBlur: true,
      }}
    >
      <AppStack.Screen name="Main" component={TabNavigator} />
      <AppStack.Screen
        name="TaskRecording"
        component={TaskRecordingScreen}
        options={{
          // JS-based stack navigator avoids native header lifecycle events entirely
          // This prevents topWillDisappear/topHeaderHeightChange crashes with native modules
          presentation: 'modal',
          cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
          gestureEnabled: false,
          headerShown: false,
          // Make content fill the screen with black background
          cardStyle: { backgroundColor: '#000' },
        }}
      />
    </AppStack.Navigator>
  );
}

/**
 * LogoutOverlay - A full-screen modal overlay shown during logout.
 * This COVERS the App screens without unmounting them.
 * The ScrollViews stay mounted (so they can receive events),
 * and only unmount when auth status actually changes.
 */
function LogoutOverlay() {
  return (
    <View style={logoutOverlayStyles.container} pointerEvents="box-only">
      <View style={logoutOverlayStyles.content}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={logoutOverlayStyles.text}>Signing out...</Text>
      </View>
    </View>
  );
}

const logoutOverlayStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  content: {
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
});

/**
 * AppNavigator uses conditional screen children within a SINGLE navigator.
 *
 * NOTE: With Fabric disabled (see ios/Podfile), the Paper renderer
 * handles scroll events gracefully when components unmount - it simply
 * drops the events instead of crashing. The logout overlay provides
 * visual smoothness during the transition.
 *
 * @see https://reactnavigation.org/docs/auth-flow/
 */
export function AppNavigator() {
  const status = useAuthStore(s => s.status);
  const isLoggingOut = useAuthStore(s => s.isLoggingOut);

  return (
    <NavigationContainer theme={navigationTheme}>
      {/* Show logout overlay ON TOP during transition for visual smoothness */}
      {isLoggingOut && <LogoutOverlay />}
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'unauthenticated' && (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
        {status === 'pending' && (
          <RootStack.Screen
            name="Pending"
            component={ApplicationPendingScreen}
          />
        )}
        {status === 'profile_incomplete' && (
          <RootStack.Screen
            name="ProfileCompletion"
            component={ProfileCompletionScreen}
          />
        )}
        {status === 'authenticated' && (
          <RootStack.Screen name="App" component={AppStackNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

function getTabIcon(routeName: keyof TabParamList) {
  switch (routeName) {
    case 'Bounties':
      return 'target';
    case 'Payments':
      return 'credit-card';
    case 'Referrals':
      return 'gift';
    case 'Settings':
      return 'settings';
    default:
      return 'circle';
  }
}

function BountiesRoute() {
  return <BountiesScreen />;
}

function ReferralsRoute() {
  return <ReferralsScreen />;
}

function SettingsRoute() {
  return <SettingsScreen />;
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
      }}
    >
      <AuthStack.Screen name="SignIn" component={SignInRoute} />
      <AuthStack.Screen name="ForgotEmail" component={ForgotEmailRoute} />
      <AuthStack.Screen name="ForgotOtp" component={ForgotOtpRoute} />
      <AuthStack.Screen name="ForgotReset" component={ForgotResetRoute} />
      <AuthStack.Screen name="Signup" component={SignupRoute} />
    </AuthStack.Navigator>
  );
}

function SignInRoute({
  navigation,
}: StackScreenProps<AuthStackParamList, 'SignIn'>) {
  return (
    <SignInScreen
      onCreateAccount={() => navigation.navigate('Signup')}
      onForgotPassword={() => navigation.navigate('ForgotEmail')}
    />
  );
}

function ForgotEmailRoute({
  navigation,
}: StackScreenProps<AuthStackParamList, 'ForgotEmail'>) {
  const { mutate: forgotPassword } = useForgotPassword();

  const handleResend = (email: string) => {
    forgotPassword({ email });
  };

  return (
    <ForgotPasswordScreen
      onNext={email => navigation.navigate('ForgotOtp', { email })}
      onBack={() => navigation.goBack()}
    />
  );
}

function ForgotOtpRoute({
  navigation,
  route,
}: StackScreenProps<AuthStackParamList, 'ForgotOtp'>) {
  const { email } = route.params;
  const { mutate: forgotPassword } = useForgotPassword();

  const handleResend = () => {
    forgotPassword({ email });
  };

  return (
    <ForgotPasswordOtpScreen
      email={email}
      onVerify={token => navigation.navigate('ForgotReset', { token })}
      onBack={() => navigation.goBack()}
      onResend={handleResend}
    />
  );
}

function ForgotResetRoute({
  navigation,
  route,
}: StackScreenProps<AuthStackParamList, 'ForgotReset'>) {
  const { token } = route.params;

  return (
    <ResetPasswordScreen
      token={token}
      onSuccess={() => navigation.navigate('SignIn')}
      onBack={() => navigation.goBack()}
    />
  );
}

function SignupRoute() {
  return <SignupStepperScreen />;
}
