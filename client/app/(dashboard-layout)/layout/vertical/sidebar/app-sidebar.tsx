
import * as React from "react";
import { Suspense } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader } from "@/components/ui/sidebar";
import FullLogo from "../../shared/logo/full-logo";
import sidebaritems from "./sidebaritems";
import NavCollapse from "./nav-collapse";
import { NavSecondary } from "./nav-secondary";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function NavSkeleton() {
    return (
        <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-20 mt-2" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
        </div>
    );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar
            variant="inset"
            collapsible="icon"
            {...props}
            className="sidebar-box **:data-[slot=sidebar-inner]:bg-background **:data-[slot=sidebar-inner]:border **:data-[slot=sidebar-inner]:border-border group-data-[state=collapsed]:hover:shadow-xl"
           side="left"
        >
            <SidebarHeader className="p-3 group-data-[state=collapsed]:px-2.5 flex flex-row items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                    <FullLogo />
                </div>
                <Badge className="group-data-[state=collapsed]:hidden" variant={"secondary"}>V.1.0</Badge>
            </SidebarHeader>

            <SidebarContent>
                <div className="h-full overflow-y-auto">
                    <SidebarGroup className="flex items-center justify-center group-data-[state=collapsed]:px-2 px-3 py-4">
                        <div className="px-0 group-data-[state=collapsed]:px-0 w-full flex flex-col gap-4">
                            <Suspense fallback={<NavSkeleton />}>
                                <NavCollapse menu={sidebaritems} className="text-sm" />
                            </Suspense>
                        </div>
                    </SidebarGroup>
                </div>
            </SidebarContent>

            <SidebarFooter className="p-4">
                <div className="hide-menu flex flex-col gap-2">
                    <NavSecondary />
                </div>
            </SidebarFooter>

        </Sidebar >

    );
}