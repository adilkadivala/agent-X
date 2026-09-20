import { Suspense } from "react";
import BreadcrumbComp from "@/app/(dashboard-layout)/layout/shared/breadcrumb/breadcrumb-comp";
import BlogDetailData from "@/app/components/apps/blog/detail";
import { BlogProvider } from "@/app/context/blog-context/index";
import type { Metadata } from "next";
import StyleAwareWrapper from "@/app/components/shared/StyleAwareWrapper";
import StyleDivider from "@/app/components/shared/StyleDivider";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Blog Details",
};

/** Prerender one shell for Instant Navigations / ISR with Cache Components */
export function generateStaticParams() {
  return [{ slug: "garmins-instinct-crossover-is-a-rugged-hybrid-smartwatch" }];
}

const BCrumb = [
  { to: "/", title: "Home" },
  { title: "Blog Detail" },
];

function BlogDetailFallback() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

const BlogDetail = () => {
  return (
    <BlogProvider>
      <StyleAwareWrapper
        lyraClassName="flex flex-col p-px gap-px bg-border"
      >
        <BreadcrumbComp title="Blog Detail" items={BCrumb} />
        <StyleDivider />
        <Suspense fallback={<BlogDetailFallback />}>
          <BlogDetailData />
        </Suspense>
      </StyleAwareWrapper>
    </BlogProvider>
  );
};

export default BlogDetail;
