import { SettingsRow, SettingsSection } from "components/components/console";
import { ThemeToggle } from "components/components/ui/theme-toggle";

/**
 * Appearance settings tab - theme toggle
 */
export function AppearanceTab() {
  return (
    <SettingsSection title="Display">
      <SettingsRow title="Theme" description="Switch between light and dark mode.">
        <ThemeToggle />
      </SettingsRow>
    </SettingsSection>
  );
}
