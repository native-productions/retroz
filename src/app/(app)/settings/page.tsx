import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { PageHeader, PageBody } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings } from "@/lib/actions/settings-actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  const apiKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY);
  const codexAuthPresent = existsSync(path.join(homedir(), ".codex", "auth.json"));

  return (
    <>
      <PageHeader
        title="Settings"
        description="Engine, model defaults, and access."
        breadcrumb={[{ label: "Settings" }]}
      />
      <PageBody>
        <SettingsForm
          initial={{
            defaultModel: settings.defaultModel,
            claudeAuthMode: settings.claudeAuthMode,
            codexModel: settings.codexModel,
            codexReasoningEffort: settings.codexReasoningEffort,
          }}
          apiKeyPresent={apiKeyPresent}
          codexAuthPresent={codexAuthPresent}
        />
      </PageBody>
    </>
  );
}
