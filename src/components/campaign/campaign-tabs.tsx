"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/ui-tabs";

const TAB_VALUES = ["brief", "calendar", "photos", "schedule"] as const;

export function CampaignTabs({
  brief,
  calendar,
  photos,
  schedule,
  counts,
  defaultTab = "brief",
  plannerStarted = false,
}: {
  brief: React.ReactNode;
  calendar: React.ReactNode;
  photos: React.ReactNode;
  schedule: React.ReactNode;
  counts: { calendar: number; photos: number };
  defaultTab?: (typeof TAB_VALUES)[number];
  /** Until the planner has run once, only the Brief tab is reachable. */
  plannerStarted?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Everything past Brief is empty until the planner has been kicked off.
  const isDisabled = (value: string) => !plannerStarted && value !== "brief";

  const param = searchParams.get("tab");
  const requested = (TAB_VALUES as readonly string[]).includes(param ?? "")
    ? (param as string)
    : defaultTab;
  const active = isDisabled(requested) ? "brief" : requested;

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="brief">Brief</TabsTrigger>
        <TabsTrigger value="calendar" disabled={isDisabled("calendar")}>
          Calendar · {counts.calendar}
        </TabsTrigger>
        <TabsTrigger value="photos" disabled={isDisabled("photos")}>
          Photos · {counts.photos}
        </TabsTrigger>
        <TabsTrigger value="schedule" disabled={isDisabled("schedule")}>
          Schedule
        </TabsTrigger>
      </TabsList>
      <TabsContent value="brief">{brief}</TabsContent>
      <TabsContent value="calendar">{calendar}</TabsContent>
      <TabsContent value="photos">{photos}</TabsContent>
      <TabsContent value="schedule">{schedule}</TabsContent>
    </Tabs>
  );
}
