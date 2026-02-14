import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "components/components/ui/tabs";
import { useTheme } from "next-themes";

/**
 * Appearance settings tab - theme selection
 */
export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how OpenDiff looks on your device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-base">Theme</p>
              <p className="text-sm text-muted-foreground">Select your preferred theme.</p>
            </div>
            <Tabs value={theme} onValueChange={setTheme}>
              <TabsList className="!bg-background shadow-none">
                <TabsTrigger className="data-active:!bg-card" value="light">
                  Light
                </TabsTrigger>
                <TabsTrigger className="data-active:!bg-card" value="dark">
                  Dark
                </TabsTrigger>
                <TabsTrigger className="data-active:!bg-card" value="system">
                  System
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
