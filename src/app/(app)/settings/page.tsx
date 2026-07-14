import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/ui-card";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings } from "@/lib/actions/settings-actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  const apiKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Model defaults and Claude access."
        breadcrumb={[{ label: "Settings" }]}
      />
      <PageBody>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Claude engine</CardTitle>
            <CardDescription>
              How this local app talks to Claude.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              initial={{
                defaultModel: settings.defaultModel,
                claudeAuthMode: settings.claudeAuthMode,
              }}
              apiKeyPresent={apiKeyPresent}
            />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
