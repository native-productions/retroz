"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/ui-tabs";

const TAB_VALUES = [
  "instruction",
  "assets",
  "fonts",
  "skills",
  "tasks",
  "plan",
  "schedule",
] as const;

export function WorkflowTabs({
  instruction,
  assets,
  fonts,
  skills,
  tasks,
  plan,
  schedule,
  counts,
}: {
  instruction: React.ReactNode;
  assets: React.ReactNode;
  fonts: React.ReactNode;
  skills: React.ReactNode;
  tasks: React.ReactNode;
  plan: React.ReactNode;
  schedule: React.ReactNode;
  counts: {
    assets: number;
    tasks: number;
    schedules: number;
    fonts: number;
    skills: number;
    campaigns: number;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const param = searchParams.get("tab");
  const active = (TAB_VALUES as readonly string[]).includes(param ?? "")
    ? (param as string)
    : "instruction";

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="instruction">Settings</TabsTrigger>
        <TabsTrigger value="assets">Assets · {counts.assets}</TabsTrigger>
        <TabsTrigger value="fonts">Fonts · {counts.fonts}</TabsTrigger>
        <TabsTrigger value="skills">Skills · {counts.skills}</TabsTrigger>
        <TabsTrigger value="tasks">Tasks · {counts.tasks}</TabsTrigger>
        <TabsTrigger value="plan">Campaign · {counts.campaigns}</TabsTrigger>
        <TabsTrigger value="schedule">
          Schedule · {counts.schedules}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="instruction">{instruction}</TabsContent>
      <TabsContent value="assets">{assets}</TabsContent>
      <TabsContent value="fonts">{fonts}</TabsContent>
      <TabsContent value="skills">{skills}</TabsContent>
      <TabsContent value="tasks">{tasks}</TabsContent>
      <TabsContent value="plan">{plan}</TabsContent>
      <TabsContent value="schedule">{schedule}</TabsContent>
    </Tabs>
  );
}
