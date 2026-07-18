"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/ui-tabs";

const TAB_VALUES = ["brief", "planner", "calendar", "photos", "schedule"] as const;

export function CampaignTabs({
  brief,
  planner,
  calendar,
  photos,
  schedule,
  counts,
  defaultTab = "brief",
}: {
  brief: React.ReactNode;
  planner: React.ReactNode;
  calendar: React.ReactNode;
  photos: React.ReactNode;
  schedule: React.ReactNode;
  counts: { calendar: number; photos: number };
  defaultTab?: (typeof TAB_VALUES)[number];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const param = searchParams.get("tab");
  const active = (TAB_VALUES as readonly string[]).includes(param ?? "")
    ? (param as string)
    : defaultTab;

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="brief">Brief</TabsTrigger>
        <TabsTrigger value="planner">Planner</TabsTrigger>
        <TabsTrigger value="calendar">Calendar · {counts.calendar}</TabsTrigger>
        <TabsTrigger value="photos">Photos · {counts.photos}</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
      </TabsList>
      <TabsContent value="brief">{brief}</TabsContent>
      <TabsContent value="planner">{planner}</TabsContent>
      <TabsContent value="calendar">{calendar}</TabsContent>
      <TabsContent value="photos">{photos}</TabsContent>
      <TabsContent value="schedule">{schedule}</TabsContent>
    </Tabs>
  );
}
