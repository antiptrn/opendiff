import { type ReactNode, createContext, useContext } from "react";

interface NavigationConfig {
  /** Where to redirect after successful auth (default: "/console") */
  afterAuthUrl: string;
  /** URL for organization settings (default: "/console/settings/organization") */
  orgSettingsUrl: string;
}

const defaultConfig: NavigationConfig = {
  afterAuthUrl: "/console",
  orgSettingsUrl: "/console/settings/organization",
};

const NavigationConfigContext = createContext<NavigationConfig>(defaultConfig);

/** Provides navigation configuration values to child components via context. */
export function NavigationConfigProvider({
  config,
  children,
}: {
  config: Partial<NavigationConfig>;
  children: ReactNode;
}) {
  return (
    <NavigationConfigContext.Provider value={{ ...defaultConfig, ...config }}>
      {children}
    </NavigationConfigContext.Provider>
  );
}

/** Returns the current navigation configuration from context. */
export function useNavigationConfig() {
  return useContext(NavigationConfigContext);
}
